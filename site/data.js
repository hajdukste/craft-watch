// One shared load of data/apps.json per page.
// 'no-cache' = ask the server if the file changed (cheap 304 when it didn't) instead of downloading it every time.
let pending = null;

export function loadApps({ fresh = false } = {}) {
  if (!pending || fresh) {
    pending = fetch('data/apps.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    pending.catch(() => { pending = null; });
  }
  return pending;
}
