/**
 * Mock CRM API. Stands in for a system like HubSpot or Salesforce.
 *   GET   /crm/v1/customers?search=&limit=&offset=
 *   GET   /crm/v1/customers/:customerRef        (includes contacts)
 *   POST  /crm/v1/customers                     (creates customer + primary contact)
 *   PATCH /crm/v1/customers/:customerRef        (updates customer fields)
 *
 * Like a real CRM, this only enforces data rules (valid fields, unique email).
 * Who may create customers or change tier/status is decided by the MCP server.
 */
import { and, asc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client';
import { formatRef } from '../../db/refs';
import {
  contacts,
  customers,
  customerStatus,
  customerTier,
} from '../../db/schema/index';
import {
  ApiError,
  iso,
  likePattern,
  notFound,
  paginate,
  paginationQuery,
  parse,
} from '../lib/helper';

type CustomerRow = typeof customers.$inferSelect;

const toCustomer = (c: CustomerRow) => ({
  customer_ref: c.customerRef,
  name: c.name,
  primary_email: c.primaryEmail,
  phone: c.phone,
  tier: c.tier,
  status: c.status,
  region: c.region,
  customer_since: iso(c.createdAt),
  updated_at: iso(c.updatedAt),
});

/** Emails are stored lowercase so uniqueness checks are case-insensitive. */
const emailField = z.email().transform((v) => v.toLowerCase());

async function customerWithContacts(customerRef: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.customerRef, customerRef));
  if (!customer) throw notFound('Customer', customerRef);

  const contactRows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.customerId, customer.id))
    .orderBy(asc(contacts.name));

  return {
    ...toCustomer(customer),
    contacts: contactRows.map((ct) => ({
      name: ct.name,
      email: ct.email,
      phone: ct.phone,
      role: ct.role,
      is_primary: ct.isPrimary,
    })),
  };
}

/** Rejects an email already used by another customer (optionally excluding one). */
async function assertEmailAvailable(email: string, excludeCustomerId?: string) {
  const [taken] = await db
    .select({ customerRef: customers.customerRef })
    .from(customers)
    .where(
      and(
        eq(sql`lower(${customers.primaryEmail})`, email),
        excludeCustomerId ? ne(customers.id, excludeCustomerId) : undefined,
      ),
    );
  if (taken) {
    throw new ApiError(
      409,
      'email_already_exists',
      `Email is already used by ${taken.customerRef}`,
      {
        existing_customer_ref: taken.customerRef,
      },
    );
  }
}

export async function crmRoutes(app: FastifyInstance) {
  // ─── Search ───────────────────────────────────────────
  app.get('/crm/v1/customers', async (request: FastifyRequest) => {
    const q = parse(
      paginationQuery.extend({
        search: z.string().trim().min(2).max(100).optional(),
      }),
      request.query,
    );
    const where = q.search
      ? or(
          ilike(customers.name, likePattern(q.search)),
          ilike(customers.customerRef, likePattern(q.search)),
          ilike(customers.primaryEmail, likePattern(q.search)),
        )
      : undefined;

    const rows = await db
      .select()
      .from(customers)
      .where(where)
      .orderBy(asc(customers.name))
      .limit(q.limit + 1)
      .offset(q.offset);

    const page = paginate(rows, q.limit, q.offset);
    return { ...page, data: page.data.map(toCustomer) };
  });

  // ─── Detail ───────────────────────────────────────────
  app.get('/crm/v1/customers/:customerRef', async (request: FastifyRequest) => {
    const { customerRef } = parse(
      z.object({ customerRef: z.string() }),
      request.params,
    );
    return customerWithContacts(customerRef);
  });

  // ─── Create ───────────────────────────────────────────
  app.post(
    '/crm/v1/customers',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = parse(
        z.object({
          name: z.string().trim().min(2).max(150),
          primary_email: emailField,
          phone: z.string().trim().min(6).max(30).optional(),
          tier: z.enum(customerTier.enumValues).default('standard'),
          region: z.string().trim().min(2).max(50),
          primary_contact: z.object({
            name: z.string().trim().min(2).max(100),
            email: emailField,
            phone: z.string().trim().min(6).max(30).optional(),
            role: z.string().trim().min(2).max(100),
          }),
          created_by: z.string().min(1),
        }),
        request.body,
      );

      await assertEmailAvailable(body.primary_email);

      const customerRef = await db.transaction(async (tx) => {
        const [{ next } = { next: 0 }] = await tx.execute<{ next: number }>(
          sql`select nextval('mock.customer_ref_seq')::int as next`,
        );
        const ref = formatRef('CUS', next);
        const [created] = await tx
          .insert(customers)
          .values({
            customerRef: ref,
            name: body.name,
            primaryEmail: body.primary_email,
            phone: body.phone ?? null,
            tier: body.tier,
            status: 'active',
            region: body.region,
          })
          .returning({ id: customers.id });
        await tx.insert(contacts).values({
          customerId: created!.id,
          name: body.primary_contact.name,
          email: body.primary_contact.email,
          phone: body.primary_contact.phone ?? null,
          role: body.primary_contact.role,
          isPrimary: true,
        });
        return ref;
      });

      request.log.info(
        { customerRef, createdBy: body.created_by },
        'Customer created',
      );
      reply.status(201);
      return customerWithContacts(customerRef);
    },
  );

  // ─── Update ───────────────────────────────────────────
  app.patch(
    '/crm/v1/customers/:customerRef',
    async (request: FastifyRequest) => {
      const { customerRef } = parse(
        z.object({ customerRef: z.string() }),
        request.params,
      );
      const body = parse(
        z
          .object({
            name: z.string().trim().min(2).max(150).optional(),
            primary_email: emailField.optional(),
            phone: z.string().trim().min(6).max(30).nullable().optional(),
            tier: z.enum(customerTier.enumValues).optional(),
            status: z.enum(customerStatus.enumValues).optional(),
            region: z.string().trim().min(2).max(50).optional(),
            updated_by: z.string().min(1),
          })
          .refine(
            ({ updated_by: _updatedBy, ...fields }) =>
              Object.values(fields).some((v) => v !== undefined),
            { message: 'Provide at least one field to update' },
          ),
        request.body,
      );

      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.customerRef, customerRef));
      if (!customer) throw notFound('Customer', customerRef);

      // Only real changes are applied, so a no-op update doesn't bump updated_at.
      const changes: string[] = [];
      const set: Partial<typeof customers.$inferInsert> = {};
      const track = <K extends keyof typeof set>(
        field: K,
        label: string,
        next: (typeof set)[K],
      ) => {
        const current = customer[field as keyof CustomerRow];
        if (next !== undefined && next !== current) {
          set[field] = next;
          changes.push(`${label} ${current ?? 'none'} → ${next ?? 'none'}`);
        }
      };
      track('name', 'name', body.name);
      track('primaryEmail', 'primary_email', body.primary_email);
      track('phone', 'phone', body.phone);
      track('tier', 'tier', body.tier);
      track('status', 'status', body.status);
      track('region', 'region', body.region);

      if (set.primaryEmail)
        await assertEmailAvailable(set.primaryEmail, customer.id);

      if (changes.length > 0) {
        await db
          .update(customers)
          .set({ ...set, updatedAt: new Date() })
          .where(eq(customers.id, customer.id));
        request.log.info(
          { customerRef, updatedBy: body.updated_by, changes },
          'Customer updated',
        );
      }

      return {
        ...(await customerWithContacts(customerRef)),
        changes_applied: changes,
      };
    },
  );
}
