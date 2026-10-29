/** Save a fetched Blob (authenticated download) under the given file name. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open a file whose (signed) URL must be fetched first. The tab is opened right away, inside the
 *  click, so popup blockers allow it, and pointed at the URL once it arrives. False on failure. */
export async function openInNewTab(getUrl: () => Promise<string>): Promise<boolean> {
  const tab = window.open('', '_blank');
  try {
    const url = await getUrl();
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
    return true;
  } catch {
    tab?.close();
    return false;
  }
}
