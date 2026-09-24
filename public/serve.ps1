# Serves this folder at http://localhost:4391/ and opens the FIRE Planner in your browser.
# Started by "Start FIRE Planner.cmd". Needs only Windows PowerShell (no Node.js, no internet).
# Close the window (or press Ctrl+C) to stop the planner.
# This file is plain ASCII on purpose: Windows PowerShell 5.1 misreads UTF-8 without a BOM, so the
# box-drawing characters below are built from their code points.

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$port = 4391
$url = "http://localhost:$port/"

try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$c = @{ tl = [char]0x256D; tr = [char]0x256E; bl = [char]0x2570; br = [char]0x256F; h = [char]0x2500; v = [char]0x2502; dot = [char]0x25CF }

function Write-Banner([string]$status, [string]$statusColor) {
  $width = 52
  $title = '  FIRE Planner'
  $badge = "$($c.dot) $status  "
  $gap = $width - $title.Length - $badge.Length
  Write-Host ''
  Write-Host ("  " + $c.tl + ([string]$c.h * $width) + $c.tr) -ForegroundColor DarkCyan
  Write-Host ("  " + $c.v) -ForegroundColor DarkCyan -NoNewline
  Write-Host $title -ForegroundColor White -NoNewline
  Write-Host (' ' * $gap) -NoNewline
  Write-Host $badge -ForegroundColor $statusColor -NoNewline
  Write-Host $c.v -ForegroundColor DarkCyan
  Write-Host ("  " + $c.bl + ([string]$c.h * $width) + $c.br) -ForegroundColor DarkCyan
  Write-Host ''
}

function Write-Field([string]$label, [string]$value, [string]$color = 'Gray') {
  Write-Host ('    ' + $label.PadRight(10)) -ForegroundColor DarkGray -NoNewline
  Write-Host $value -ForegroundColor $color
}

function Write-Activity([string]$message, [string]$color = 'Gray') {
  Write-Host ('    ' + (Get-Date).ToString('h:mm tt').PadRight(10)) -ForegroundColor DarkGray -NoNewline
  Write-Host $message -ForegroundColor $color
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try {
  $listener.Start()
} catch {
  # Most likely already running (from this launcher or `npm run preview`): just open it.
  $Host.UI.RawUI.WindowTitle = 'FIRE Planner'
  Write-Banner 'already running' 'Yellow'
  Write-Host "    Another copy is already using port $port - opening it in your browser." -ForegroundColor Gray
  Write-Host '    This window will close in a few seconds.' -ForegroundColor DarkGray
  Start-Process $url
  Start-Sleep -Seconds 4
  exit
}

$Host.UI.RawUI.WindowTitle = "FIRE Planner - running at localhost:$port"
Write-Banner 'running' 'Green'
Write-Field 'Open' $url 'Cyan'
Write-Field 'Folder' $root.TrimEnd('\')
Write-Field 'Started' (Get-Date).ToString('ddd MMM d, h:mm tt')
Write-Host ''
Write-Host '    Keep this window open while you use the planner.' -ForegroundColor Gray
Write-Host '    Close it (or press Ctrl+C) to stop.' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Activity' -ForegroundColor White
Start-Process $url
Write-Activity 'Opened the planner in your browser'

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
  '.woff2' = 'font/woff2'
}

try {
  while ($listener.IsListening) {
    # Wait in short slices so Ctrl+C is handled promptly.
    $pending = $listener.GetContextAsync()
    while (-not $pending.AsyncWaitHandle.WaitOne(250)) { }
    $ctx = $pending.GetAwaiter().GetResult()
    $res = $ctx.Response
    try {
      # Only this computer, only reading files.
      if (-not $ctx.Request.IsLocal -or $ctx.Request.HttpMethod -ne 'GET') {
        $res.StatusCode = 403
        continue
      }
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
      # Never serve anything outside this folder.
      if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $res.StatusCode = 404
        continue
      }
      # Only the file types the app itself uses: never session .json files, SSA statements or anything
      # else someone keeps in this folder.
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      $type = $types[$ext]
      if (-not $type) {
        $res.StatusCode = 404
        continue
      }
      $bytes = [IO.File]::ReadAllBytes($file)
      $res.ContentType = $type
      $res.Headers['Cache-Control'] = 'no-cache'
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      if ($rel -eq 'index.html') { Write-Activity 'Planner loaded in a browser tab' }
    } catch {
      # Headers may already be sent (e.g. the browser dropped the connection mid-download).
      try { $res.StatusCode = 500 } catch { }
    } finally {
      # Closing a response whose client went away can throw; that must not stop the server.
      try { $res.Close() } catch { }
    }
  }
} finally {
  $listener.Close()
  Write-Host ''
  Write-Activity 'Stopped' 'Yellow'
}
