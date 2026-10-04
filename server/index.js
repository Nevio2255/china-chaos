app.get('/download/windows', async (req, res) => {
  try {
    const response = await fetch(
      'https://api.github.com/repos/Nevio2255/china-chaos/releases/latest',
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'China-Chaos'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API: ${response.status}`);
    }

    const release = await response.json();

    const installer = release.assets?.find(asset =>
      /^ChinaChaos-Setup-.*\.exe$/i.test(asset.name)
    );

    if (!installer?.browser_download_url) {
      return res.status(404).send(
        'Für die aktuelle China-Chaos-Version wurde kein Windows-Installer gefunden.'
      );
    }

    return res.redirect(302, installer.browser_download_url);

  } catch (error) {
    console.error('Windows-Download:', error);

    return res.status(503).send(
      'Der Windows-Download ist momentan nicht verfügbar.'
    );
  }
});
