[CmdletBinding()]
param(
    [Parameter()]
    [string] $OutputPath = 'docs\piworkflow.html'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$readmePath = Join-Path $repositoryRoot 'README.md'
$imagePath = Join-Path $repositoryRoot 'docs\images\workflow-manager.png'
$resolvedOutput = Join-Path $repositoryRoot $OutputPath

if (-not (Test-Path -LiteralPath $readmePath -PathType Leaf)) {
    throw "README not found: $readmePath"
}
if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
    throw "Workflow Manager image not found: $imagePath"
}

$markdown = [System.IO.File]::ReadAllText($readmePath)
$body = (ConvertFrom-Markdown -InputObject $markdown).Html
$imageBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($imagePath))
$body = $body.Replace('src="docs/images/workflow-manager.png"', "src=`"data:image/png;base64,$imageBase64`"")

$template = @'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="PixInsight Workflow Manager for configurable post-processing of integrated linear color masters, including gradient correction, SPCC, deblur, denoise, star separation, recombination, and stretching.">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="https://ccdastro.com/piworkflow.html">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="CCDASTRO">
  <meta property="og:title" content="PixInsight Workflow Manager – Automated Color Image Post-Processing">
  <meta property="og:description" content="A configurable PixInsight workflow for post-processing integrated linear color masters in the correct order.">
  <meta property="og:url" content="https://ccdastro.com/piworkflow.html">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="PixInsight Workflow Manager – Automated Color Image Post-Processing">
  <meta name="twitter:description" content="A configurable PixInsight workflow for post-processing integrated linear color masters in the correct order.">
  <title>PixInsight Workflow Manager – Automated Color Image Post-Processing</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "CCDASTRO PixInsight Workflow Manager",
    "softwareVersion": "1.1.1",
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "Windows, macOS, Linux",
    "url": "https://ccdastro.com/piworkflow.html",
    "downloadUrl": "https://github.com/CCDASTRO/PixInsight-Workflow-Manager",
    "description": "A configurable PixInsight post-processing workflow manager for integrated linear color master images.",
    "author": {
      "@type": "Person",
      "name": "Chuck Faranda"
    },
    "publisher": {
      "@type": "Organization",
      "name": "CCDASTRO, Inc.",
      "url": "https://ccdastro.com/"
    }
  }
  </script>
  <style>
    :root {
      color-scheme: dark;
      --page: #07111f;
      --panel: #0e1b2c;
      --panel-2: #13243a;
      --text: #e8f0f7;
      --muted: #a8bacb;
      --accent: #68d5e8;
      --accent-2: #9ce8f4;
      --line: #27415b;
      --code: #071522;
      --shadow: 0 20px 55px rgba(0, 0, 0, .32);
      --radius: 14px;
    }
    :root[data-theme="light"] {
      color-scheme: light;
      --page: #eef4f8;
      --panel: #ffffff;
      --panel-2: #f4f8fb;
      --text: #142638;
      --muted: #53697c;
      --accent: #087f99;
      --accent-2: #05677d;
      --line: #cad9e3;
      --code: #edf4f7;
      --shadow: 0 18px 45px rgba(28, 55, 77, .13);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: radial-gradient(circle at 85% -10%, rgba(59, 164, 196, .18), transparent 34%), var(--page);
      color: var(--text);
      font: 16px/1.68 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    a { color: var(--accent); text-underline-offset: 3px; }
    a:hover { color: var(--accent-2); }
    .topbar {
      position: sticky; top: 0; z-index: 20;
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      padding: .75rem clamp(1rem, 4vw, 3rem);
      background: color-mix(in srgb, var(--page) 88%, transparent);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(14px);
    }
    .brand { display: flex; align-items: center; gap: .7rem; font-weight: 750; letter-spacing: .02em; }
    .mark {
      width: 2rem; height: 2rem; display: grid; place-items: center;
      border: 1px solid var(--accent); border-radius: 50%; color: var(--accent);
      box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .actions { display: flex; gap: .55rem; }
    button, .button {
      border: 1px solid var(--line); border-radius: 9px; padding: .5rem .75rem;
      background: var(--panel); color: var(--text); font: inherit; font-size: .88rem;
      text-decoration: none; cursor: pointer;
    }
    button:hover, .button:hover { border-color: var(--accent); color: var(--accent); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .copy-controls { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; margin-bottom: 1rem; }
    .copy-status { color: var(--muted); font-size: .9rem; }
    .layout {
      width: min(1260px, calc(100% - 2rem)); margin: 2rem auto 4rem;
      display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 2rem; align-items: start;
    }
    .toc {
      position: sticky; top: 5rem; max-height: calc(100vh - 6rem); overflow: auto;
      padding: 1rem; border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--panel); box-shadow: var(--shadow);
    }
    .toc strong { display: block; margin-bottom: .65rem; font-size: .82rem; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; }
    .toc a { display: block; padding: .32rem .4rem; border-radius: 7px; color: var(--muted); text-decoration: none; font-size: .88rem; line-height: 1.3; }
    .toc a.sub { padding-left: 1.1rem; font-size: .82rem; }
    .toc a:hover, .toc a.active { background: var(--panel-2); color: var(--accent); }
    main {
      min-width: 0; padding: clamp(1.25rem, 4vw, 3rem);
      border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--panel); box-shadow: var(--shadow);
    }
    h1, h2, h3 { line-height: 1.2; scroll-margin-top: 5rem; }
    h1 { margin: 0 0 1rem; font-size: clamp(2rem, 5vw, 3.4rem); letter-spacing: -.045em; }
    h1::after { content: ""; display: block; width: 5rem; height: 4px; margin-top: 1rem; border-radius: 9px; background: var(--accent); }
    h2 { margin: 3rem 0 1rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: 1.65rem; }
    h3 { margin: 2rem 0 .8rem; font-size: 1.2rem; color: var(--accent-2); }
    p, li { max-width: 78ch; }
    li + li { margin-top: .32rem; }
    img { display: block; max-width: 100%; height: auto; margin: 1.5rem auto; border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
    table { width: 100%; margin: 1.25rem 0 2rem; border-collapse: collapse; font-size: .93rem; }
    th, td { padding: .75rem; border: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { background: var(--panel-2); color: var(--accent-2); }
    tr:nth-child(even) td { background: color-mix(in srgb, var(--panel-2) 45%, transparent); }
    code { padding: .15em .38em; border-radius: 5px; background: var(--code); color: var(--accent-2); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; }
    pre { overflow: auto; padding: 1rem; border: 1px solid var(--line); border-radius: 10px; background: var(--code); }
    pre code { padding: 0; background: transparent; color: var(--text); }
    blockquote { margin: 1.25rem 0; padding: .7rem 1rem; border-left: 4px solid var(--accent); background: var(--panel-2); color: var(--muted); }
    .footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .88rem; }
    @media (max-width: 860px) {
      .layout { grid-template-columns: 1fr; }
      .toc { position: relative; top: 0; max-height: 15rem; }
      .brand span:last-child { display: none; }
    }
    @media print {
      .topbar, .toc, .copy-controls { display: none; }
      body { background: white; color: black; }
      .layout { display: block; width: 100%; margin: 0; }
      main { border: 0; box-shadow: none; padding: 0; }
      a { color: inherit; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand"><span class="mark" aria-hidden="true">✦</span><span>CCDASTRO · PixInsight Workflow Manager</span></div>
    <div class="actions">
      <a class="button" href="https://github.com/CCDASTRO/PixInsight-Workflow-Manager">GitHub</a>
      <button id="print" type="button">Print / PDF</button>
      <button id="theme" type="button" aria-label="Switch color theme">Light</button>
    </div>
  </header>
  <div class="layout">
    <nav class="toc" aria-label="On this page"><strong>On this page</strong><div id="toc"></div></nav>
    <main id="content">
{{BODY}}
      <footer class="footer">CCDASTRO PixInsight Workflow Manager v1.1.1 · Chuck Faranda / CCDASTRO, Inc.</footer>
    </main>
  </div>
  <script>
    (() => {
      const root = document.documentElement;
      const theme = document.getElementById('theme');
      let saved;
      try { saved = localStorage.getItem('ccdastro-theme'); } catch (_) { /* Storage may be blocked. */ }
      if (saved === 'light') root.dataset.theme = 'light';
      const syncThemeLabel = () => theme.textContent = root.dataset.theme === 'light' ? 'Dark' : 'Light';
      syncThemeLabel();
      theme.addEventListener('click', () => {
        root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
        try { localStorage.setItem('ccdastro-theme', root.dataset.theme); } catch (_) { /* Keep the session theme. */ }
        syncThemeLabel();
      });
      document.getElementById('print').addEventListener('click', () => window.print());

      const repositoryUrl = 'https://raw.githubusercontent.com/CCDASTRO/PixInsight-Workflow-Manager/main/updates/';
      const repositoryCode = [...document.querySelectorAll('#content pre code')]
        .find(code => code.textContent.trim() === repositoryUrl);
      if (repositoryCode) {
        const controls = document.createElement('div');
        controls.className = 'copy-controls';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'Copy repository URL';
        const status = document.createElement('span');
        status.className = 'copy-status';
        status.setAttribute('role', 'status');
        controls.append(copy, status);
        repositoryCode.closest('pre').after(controls);
        copy.addEventListener('click', async () => {
          copy.disabled = true;
          status.textContent = '';
          try {
            await navigator.clipboard.writeText(repositoryUrl);
            status.textContent = 'Copied! Paste into PixInsight > Manage Repositories.';
          } catch (_) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(repositoryCode);
            selection.removeAllRanges();
            selection.addRange(range);
            status.textContent = 'Automatic copy was blocked. Copy the selected URL with Ctrl+C (Mac: Command+C), or touch and hold it and choose Copy.';
          } finally {
            copy.disabled = false;
          }
        });
      }

      const headings = [...document.querySelectorAll('#content h2, #content h3')];
      const used = new Set();
      const slug = text => {
        let value = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
        let unique = value, index = 2;
        while (used.has(unique)) unique = `${value}-${index++}`;
        used.add(unique);
        return unique;
      };
      const toc = document.getElementById('toc');
      headings.forEach(heading => {
        heading.id = slug(heading.textContent);
        const link = document.createElement('a');
        link.href = `#${heading.id}`;
        link.textContent = heading.textContent;
        if (heading.tagName === 'H3') link.className = 'sub';
        toc.appendChild(link);
      });
      const links = [...toc.querySelectorAll('a')];
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            links.forEach(link => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
          }
        });
      }, { rootMargin: '-15% 0px -75% 0px' });
      headings.forEach(heading => observer.observe(heading));
    })();
  </script>
</body>
</html>
'@

$html = $template.Replace('{{BODY}}', $body)
$outputDirectory = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
[System.IO.File]::WriteAllText($resolvedOutput, $html, [System.Text.UTF8Encoding]::new($false))
Write-Host "Created: $resolvedOutput"
