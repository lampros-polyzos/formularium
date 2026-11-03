import { useContext } from 'react';
import { DialogContext, type DialogApi } from '../contexts/dialogApi';

/** Only used where nothing provides the app's dialogs (an isolated test, say): the browser's own, so nothing breaks. */
const browserDialogs: DialogApi = {
    // eslint-disable-next-line no-alert
    alert: (message) => { window.alert(message); return Promise.resolve(); },
    // eslint-disable-next-line no-alert
    confirm: (message) => Promise.resolve(window.confirm(message)),
};

/**
 * `const { alert, confirm } = useDialog();`
 *
 * Use these instead of the browser's `alert` and `confirm`: they look like the rest of the app, work with the
 * keyboard and screen readers, and return promises, so `if (await confirm('Delete it?')) { ... }` just works.
 */
export function useDialog(): DialogApi {
    return useContext(DialogContext) ?? browserDialogs;
}
