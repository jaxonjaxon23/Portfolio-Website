# tools/og-shot.ps1 — re-take the site's default share/search image.
# Screenshots the live projects page with headless Microsoft Edge (1200x630 at 2x),
# then: node -e "require('sharp')(process.env.TEMP+'/og-shot.png').resize(1200,630).jpeg({quality:86,mozjpeg:true}).toFile('assets/og/home.jpg')"
# and commit assets/og/home.jpg.
param([string]$Url = 'https://www.jaxonstickler.com/', [string]$Out = "$env:TEMP\og-shot.png", [int]$Budget = 25000)
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$profileDir = Join-Path $env:TEMP 'edge-og-profile'
if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out }
$argList = @(
  '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars',
  '--force-device-scale-factor=2', '--window-size=1200,630', "--virtual-time-budget=$Budget",
  "--user-data-dir=`"$profileDir`"", "--screenshot=`"$Out`"", $Url
)
Start-Process -FilePath $edge -ArgumentList $argList -Wait -WindowStyle Hidden
if (Test-Path -LiteralPath $Out) { Get-Item -LiteralPath $Out | Select-Object Name, Length } else { 'no screenshot produced' }
