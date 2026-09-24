/** Long enough for the browser to read the blob; FileSaver.js uses 40 s. */
export const REVOKE_DELAY_MS = 60_000;

/**
 * Save a JSON file from an extension page. Firefox can fail the download if
 * the object URL is revoked in the same task as click(), and it is more
 * reliable when the link is attached to the document.
 */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
