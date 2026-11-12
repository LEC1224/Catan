$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $appRoot '.runtime'
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'

Set-Location -LiteralPath $appRoot
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$env:PORT = '3417'

$server = Start-Process -FilePath $node -ArgumentList 'server/index.js --production' `
    -RedirectStandardOutput (Join-Path $runtime 'server.stdout.log') `
    -RedirectStandardError (Join-Path $runtime 'server.stderr.log') -NoNewWindow -Wait -PassThru

# This is a long-running task. Restart it even if Node exits cleanly.
if ($server.ExitCode -eq 0) { exit 1 }
exit $server.ExitCode
