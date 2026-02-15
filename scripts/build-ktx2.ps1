param(
  [string]$InputDir = "public/assets/textures/planets",
  [string]$OutputDir = "public/assets/textures/planets/ktx2"
)

if (-not (Get-Command toktx -ErrorAction SilentlyContinue)) {
  Write-Error "toktx not found. Install KTX-Software and re-run this script."
  exit 1
}

New-Item -ItemType Directory -Force $OutputDir | Out-Null

Get-ChildItem -Path $InputDir -File | ForEach-Object {
  $target = Join-Path $OutputDir ("{0}.ktx2" -f $_.BaseName)
  & toktx --t2 --genmipmap --uastc $target $_.FullName
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to convert $($_.Name)"
    exit 1
  }
  Write-Output "Converted $($_.Name) -> $(Split-Path -Leaf $target)"
}
