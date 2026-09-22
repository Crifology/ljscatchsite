param([int]$Start=0,[string]$Catalog='database/species-photos.json',[string]$Output='photo-review',[switch]$Unreviewed)
Add-Type -AssemblyName System.Drawing
$root=Split-Path $PSScriptRoot -Parent
$photoCatalog=Get-Content -LiteralPath (Join-Path $root $Catalog) -Raw -Encoding UTF8 | ConvertFrom-Json
$mapping=if($photoCatalog.species){$photoCatalog.species}else{$photoCatalog}
$entries=@($mapping.PSObject.Properties.Value | Where-Object { $_.status -eq 'available' } | Sort-Object scientificName)
if($Unreviewed){
 $review=Get-Content (Join-Path $root 'database/photo-review.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 $entries=@($entries | Where-Object { $_.photo.url -notin $review.approvedPhotos -and $_.photoId -notin $review.rejectedPhotoIds })
}
$folder=Join-Path $root ('.tracker-cache/'+$Output)
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$font=New-Object System.Drawing.Font('Arial',10)
for($page=$Start;$page -lt [Math]::Ceiling($entries.Count/20);$page++) {
  $canvas=New-Object System.Drawing.Bitmap(1250,800)
  $graphics=[System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::White)
  for($cell=0;$cell -lt 20;$cell++) {
    $index=$page*20+$cell
    if($index -ge $entries.Count){break}
    $entry=$entries[$index]
    $image=[System.Drawing.Image]::FromFile((Join-Path $root $entry.photo.url.TrimStart('/')))
    $x=($cell%5)*250;$y=[Math]::Floor($cell/5)*200
    $scale=[Math]::Min(240/$image.Width,150/$image.Height)
    $graphics.DrawImage($image,[single]($x+5),[single]($y+5),[single]($image.Width*$scale),[single]($image.Height*$scale))
    $rect=[System.Drawing.RectangleF]::new(($x+5),($y+155),240,45)
    $graphics.DrawString($entry.scientificName,$font,[System.Drawing.Brushes]::Black,$rect)
    $image.Dispose()
  }
  $canvas.Save((Join-Path $folder "sheet-$page.jpg"),[System.Drawing.Imaging.ImageFormat]::Jpeg)
  $graphics.Dispose();$canvas.Dispose()
}
$font.Dispose()
Write-Output "$($entries.Count) images; $([Math]::Ceiling($entries.Count/20)) sheets"

