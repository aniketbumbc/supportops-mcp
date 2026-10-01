export const THEME_STORAGE_KEY = 'theme';
export const THEME_CHANGE_EVENT = 'themechange';

/**
 * Runs in <head> before the first paint, so a saved choice never flashes the wrong theme.
 * "system" (or nothing saved) leaves data-theme unset and the OS setting applies.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
