param(
  [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'

$prefix = "http://localhost:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "GitHub CORS Proxy running on $prefix" -ForegroundColor Green
Write-Host "Forwarding to https://api.github.com" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow

$httpClient = [System.Net.Http.HttpClient]::new()

function Add-CorsHeaders([System.Net.HttpListenerResponse]$resp) {
  $resp.Headers["Access-Control-Allow-Origin"] = "*"
  $resp.Headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  $resp.Headers["Access-Control-Allow-Headers"] = "Authorization,Content-Type,Accept,X-Requested-With"
  $resp.Headers["Access-Control-Max-Age"] = "86400"
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $resp = $ctx.Response

    Add-CorsHeaders $resp

    if ($req.HttpMethod -eq 'OPTIONS') {
      $resp.StatusCode = 204
      $resp.Close()
      continue
    }

    $pathAndQuery = $req.RawUrl
    if ([string]::IsNullOrWhiteSpace($pathAndQuery)) { $pathAndQuery = '/' }

    $targetUri = [Uri]::new("https://api.github.com$pathAndQuery")
    $method = [System.Net.Http.HttpMethod]::new($req.HttpMethod)

    $msg = [System.Net.Http.HttpRequestMessage]::new($method, $targetUri)

    # GitHub requires a User-Agent header on some requests
    $msg.Headers.TryAddWithoutValidation('User-Agent', 'Artrova-Admin-Proxy') | Out-Null

    # Forward selected headers
    $forwardHeaders = @('Accept','Authorization')
    foreach ($h in $forwardHeaders) {
      $v = $req.Headers[$h]
      if ($v) { $msg.Headers.TryAddWithoutValidation($h, $v) | Out-Null }
    }

    # Forward body if present
    if ($req.HasEntityBody) {
      $ms = New-Object System.IO.MemoryStream
      $req.InputStream.CopyTo($ms)
      $bytes = $ms.ToArray()
      $ms.Dispose()

      $content = [System.Net.Http.ByteArrayContent]::new($bytes)
      if ($req.ContentType) {
        $content.Headers.TryAddWithoutValidation('Content-Type', $req.ContentType) | Out-Null
      }
      $msg.Content = $content
    }

    try {
      $ghRes = $httpClient.SendAsync($msg).GetAwaiter().GetResult()
      $resp.StatusCode = [int]$ghRes.StatusCode

      foreach ($header in $ghRes.Headers) {
        $name = $header.Key
        if ($name -in @('Transfer-Encoding','Connection','Keep-Alive','Proxy-Authenticate','Proxy-Authorization','TE','Trailer','Upgrade')) { continue }
        $resp.Headers[$name] = ($header.Value -join ',')
      }
      if ($ghRes.Content) {
        foreach ($header in $ghRes.Content.Headers) {
          $name = $header.Key
          if ($name -in @('Transfer-Encoding','Connection','Keep-Alive','Proxy-Authenticate','Proxy-Authorization','TE','Trailer','Upgrade')) { continue }
          $resp.Headers[$name] = ($header.Value -join ',')
        }

        $out = $ghRes.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        $resp.OutputStream.Write($out, 0, $out.Length)
      }

      $resp.Close()
    } catch {
      $resp.StatusCode = 502
      $msgText = "Proxy error: $($_.Exception.Message)"
      $buf = [System.Text.Encoding]::UTF8.GetBytes($msgText)
      $resp.Headers['Content-Type'] = 'text/plain; charset=utf-8'
      $resp.OutputStream.Write($buf, 0, $buf.Length)
      $resp.Close()
    }
  }
} finally {
  try { $listener.Stop() } catch {}
  try { $listener.Close() } catch {}
  try { $httpClient.Dispose() } catch {}
}
