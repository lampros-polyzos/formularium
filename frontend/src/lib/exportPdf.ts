import { authFetch } from './authClient';

/** Posts a payload to an export endpoint and saves the PDF it returns. Throws if the backend refuses. */
export async function downloadPdf(path: string, payload: unknown, filename: string): Promise<void> {
    const res = await authFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to generate PDF');

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/** "My Lotion" + "PIF" becomes "My_Lotion_PIF.pdf". */
export const pdfFilename = (projectName: string, suffix: string) => `${projectName.replace(/\s+/g, '_')}_${suffix}.pdf`;
