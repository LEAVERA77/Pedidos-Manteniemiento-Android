# Genera documentos Word de presentacion GestorNova (Open XML, sin COM).
# Salida: docs/presentacion/*.docx
# made by leavera77

$ErrorActionPreference = 'Stop'
$outDir = Join-Path $PSScriptRoot '..\presentacion'
$templateDir = Join-Path $PSScriptRoot '..\presentacion\_ooxml-template'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function Escape-Ooxml([string]$t) {
    if ($null -eq $t) { return '' }
    return $t.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
}

function New-OoxmlRun([string]$text, [switch]$bold, [int]$sizeHalf = 0) {
    $rPr = ''
    if ($bold) { $rPr += '<w:b/><w:bCs/>' }
    if ($sizeHalf -gt 0) { $rPr += "<w:sz w:val=`"$sizeHalf`"/><w:szCs w:val=`"$sizeHalf`"/>" }
    $rPrXml = if ($rPr) { "<w:rPr>$rPr</w:rPr>" } else { '' }
    $safe = Escape-Ooxml $text
    return "<w:r>$rPrXml<w:t xml:space=`"preserve`">$safe</w:t></w:r>"
}

function New-OoxmlParagraph([string]$text, [string]$style) {
    $pPr = '<w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>'
    $runs = ''
    switch ($style) {
        'title' {
            $pPr = '<w:pPr><w:jc w:val="center"/><w:spacing w:after="200" w:before="0"/></w:pPr>'
            $runs = New-OoxmlRun $text -bold -sizeHalf 52
        }
        'subtitle' {
            $pPr = '<w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr>'
            $runs = New-OoxmlRun $text -sizeHalf 26
        }
        'h1' {
            $pPr = '<w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr>'
            $runs = New-OoxmlRun $text -bold -sizeHalf 28
        }
        'h2' {
            $pPr = '<w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr>'
            $runs = New-OoxmlRun $text -bold -sizeHalf 24
        }
        'bullet' {
            $pPr = '<w:pPr><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="80"/></w:pPr>'
            $runs = (New-OoxmlRun ([char]0x2022 + ' ' + $text) -sizeHalf 22)
        }
        default {
            $runs = New-OoxmlRun $text -sizeHalf 22
        }
    }
    return "<w:p>$pPr$runs</w:p>"
}

function New-OoxmlTable($rows) {
    $n = $rows.Count + 1
    $tblPr = '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="2563EB"/>
      <w:left w:val="single" w:sz="4" w:color="CCCCCC"/>
      <w:bottom w:val="single" w:sz="4" w:color="2563EB"/>
      <w:right w:val="single" w:sz="4" w:color="CCCCCC"/>
      <w:insideH w:val="single" w:sz="4" w:color="DDDDDD"/>
      <w:insideV w:val="single" w:sz="4" w:color="DDDDDD"/>
    </w:tblBorders></w:tblPr>'
    $grid = '<w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="6560"/></w:tblGrid>'
    $cells = @()
    $cells += (New-OoxmlTableCell 'Area / funcion' $true)
    $cells += (New-OoxmlTableCell 'Que incluye' $true)
    $trHdr = "<w:tr>$($cells -join '')</w:tr>"
    $bodyTr = @()
    foreach ($row in $rows) {
        $bodyTr += "<w:tr>$(New-OoxmlTableCell ([string]$row[0]) $false)$(New-OoxmlTableCell ([string]$row[1]) $false)</w:tr>"
    }
    return "<w:tbl>$tblPr$grid$trHdr$($bodyTr -join '')</w:tbl>"
}

function New-OoxmlTableCell([string]$text, [bool]$header) {
    $shd = if ($header) { '<w:shd w:val="clear" w:color="auto" w:fill="DBEAFE"/>' } else { '' }
    $run = if ($header) { New-OoxmlRun $text -bold -sizeHalf 22 } else { New-OoxmlRun $text -sizeHalf 20 }
    $p = '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>' + $run + '</w:p>'
    return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + $shd + '</w:tcPr>' + $p + '</w:tc>'
}

function Build-DocumentXml($lines) {
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($entry in $lines) {
        $style = [string]$entry.Style
        if ($style -eq 'table') {
            $parts.Add((New-OoxmlTable $entry.Rows))
            $parts.Add('<w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>')
        } else {
            $parts.Add((New-OoxmlParagraph ([string]$entry.Text) $style))
        }
    }
    $sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'
    $body = ($parts -join '') + $sect
    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>$body</w:body>
</w:document>
"@
}

function Expand-Docx($docxPath, $destDir) {
    $zipTmp = [System.IO.Path]::ChangeExtension($docxPath, '.zip')
    Copy-Item -LiteralPath $docxPath -Destination $zipTmp -Force
    try {
        Expand-Archive -LiteralPath $zipTmp -DestinationPath $destDir -Force
    } finally {
        Remove-Item -LiteralPath $zipTmp -Force -ErrorAction SilentlyContinue
    }
}

function Ensure-OoxmlTemplate {
    if (Test-Path (Join-Path $templateDir 'word\styles.xml')) { return }
    New-Item -ItemType Directory -Path $templateDir -Force | Out-Null
    $seed = Join-Path $outDir 'GestorNova-Municipios.docx'
    if (-not (Test-Path $seed)) {
        throw 'Falta plantilla base en docs/presentacion/GestorNova-Municipios.docx'
    }
    Expand-Docx $seed $templateDir
}

function L([string]$style, [string]$text) {
    [PSCustomObject]@{ Style = $style; Text = $text }
}
function Lt([object[]]$rows) {
    [PSCustomObject]@{ Style = 'table'; Rows = $rows }
}

function Write-DocxFromLines($fileName, $lines) {
    Ensure-OoxmlTemplate
    $docXml = Build-DocumentXml $lines
    $work = Join-Path ([System.IO.Path]::GetTempPath()) ("gn-docx-" + [Guid]::NewGuid().ToString('N'))
    if (Test-Path $work) { Remove-Item $work -Recurse -Force }
    Copy-Item -Path $templateDir -Destination $work -Recurse
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText((Join-Path $work 'word\document.xml'), $docXml, $utf8NoBom)
    $outPath = Join-Path $outDir $fileName
    if (Test-Path $outPath) { Remove-Item $outPath -Force }
    if (Test-Path ($outPath + '.tmp')) { Remove-Item ($outPath + '.tmp') -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($work, $outPath + '.tmp')
    Move-Item ($outPath + '.tmp') $outPath -Force
    Remove-Item $work -Recurse -Force
    Write-Host "OK $outPath"
}

# --- Contenido cooperativa ---
$coopTable = @(
    @('Panel web - Pedidos', 'Listado, mapa Leaflet, filtros por estado/tipo/prioridad/zona, detalle con avances, fotos, materiales, firma y cierre.')
    @('Asignacion y IA', 'Asignacion a cuadrillas, notificacion push, priorizacion sugerida por IA, deteccion de duplicados, exportacion Excel.')
    @('Red electrica', 'Importacion Excel de red (distribuidores, nivel tension kV, trafos, KVA, clientes). Select Dist. en pedido nuevo.')
    @('SAIDI / SAIFI', 'Indicadores de continuidad y estadisticas operativas desde el panel.')
    @('Catalogo socios', 'NIS, medidor, importacion masiva Excel, busqueda por NIS, apellido y direccion (Levenshtein).')
    @('Derivacion', 'Derivacion operativa a terceros; solicitud desde tecnico en campo.')
    @('Incidencias', 'Agrupacion de reclamos relacionados y clientes afectados.')
    @('WhatsApp', 'Bot de reclamos, avisos automaticos (ejecucion, avance, cierre), masivos comunidad, chat humano, STOP/ALTA.')
    @('App Android', 'Cuadrillas: GPS, fotos, avances, materiales, firma, cierre; modo offline.')
)

$coop = @(
    (L 'title' 'GestorNova')
    (L 'subtitle' 'Cooperativa electrica - Presentacion de producto')
    (L 'p' 'Mayo 2026')
    (L 'h1' 'Resumen ejecutivo')
    (L 'p' 'GestorNova centraliza el ciclo completo del reclamo: ingreso (web, WhatsApp o app), asignacion en mapa, trabajo de cuadrilla en Android, cierre con evidencias y comunicacion al socio.')
    (Lt $coopTable)
    (L 'h1' '1. Publico objetivo')
    (L 'p' 'Cooperativas y distribuidoras electricas: cortes, tension, postes, cables, alumbrado, fraude, vinculo con red y metricas SAIDI/SAIFI.')
    (L 'h1' '2. Canales de ingreso')
    (L 'bullet' 'Panel web del administrador (GitHub Pages / PWA).')
    (L 'bullet' 'WhatsApp con menu guiado para el socio.')
    (L 'bullet' 'App Android para cuadrillas tecnicas.')
    (L 'bullet' 'Catalogo de socios con NIS y medidor.')
    (L 'h1' '3. Panel web - Gestion de pedidos')
    (L 'bullet' 'Listado y mapa con filtros por estado, tipo de trabajo, prioridad y zona.')
    (L 'bullet' 'Detalle del pedido: avances, fotos, materiales, firma del socio y cierre.')
    (L 'bullet' 'Asignacion a cuadrillas con notificacion push al tecnico.')
    (L 'bullet' 'Priorizacion sugerida por inteligencia artificial.')
    (L 'bullet' 'Deteccion de pedidos duplicados.')
    (L 'bullet' 'Exportacion a Excel y correccion manual de geocodificacion.')
    (L 'h2' '3.1 Red electrica e indicadores')
    (L 'bullet' 'Importacion Excel Red Electrica: distribuidores, nivel de tension (kV), transformadores, KVA y clientes.')
    (L 'bullet' 'Selector de distribuidor en pedido nuevo desde tabla distribuidores_red.')
    (L 'bullet' 'Estadisticas SAIDI y SAIFI en el panel de informes.')
    (L 'h2' '3.2 Catalogo de socios')
    (L 'bullet' 'Importacion masiva desde Excel con plantilla por rubro.')
    (L 'bullet' 'Busqueda por NIS, medidor, apellido y direccion en padron (tolerancia a errores de tipeo).')
    (L 'bullet' 'Opt-in de avisos masivos: comandos STOP y ALTA por WhatsApp.')
    (L 'h2' '3.3 Derivacion e incidencias')
    (L 'bullet' 'Derivacion operativa a terceros desde oficina.')
    (L 'bullet' 'Solicitud de derivacion desde la app del tecnico.')
    (L 'bullet' 'Incidencias agrupadas y registro de clientes afectados.')
    (L 'h2' '3.4 WhatsApp')
    (L 'bullet' 'Bot: alta de reclamos, consulta mis reclamos, denuncia de fraude anonima.')
    (L 'bullet' 'Avisos automaticos al socio en ejecucion, cambio de avance y cierre.')
    (L 'bullet' 'Avisos masivos a la comunidad y cortes programados.')
    (L 'bullet' 'Chat humano para operador y borrador de texto con IA.')
    (L 'h2' '3.5 Administracion')
    (L 'bullet' 'Usuarios: administrador, tecnico y supervisor.')
    (L 'bullet' 'Configuracion de empresa y multitenant aislado por cliente.')
    (L 'bullet' 'Estadisticas, KPIs e informes exportables.')
    (L 'h1' '4. App Android para cuadrillas')
    (L 'bullet' 'Lista y mapa con ubicacion GPS del tecnico.')
    (L 'bullet' 'Carga de fotos, avances y materiales en campo.')
    (L 'bullet' 'Firma del socio y cierre del reclamo.')
    (L 'bullet' 'Operacion offline con sincronizacion al recuperar red.')
    (L 'h1' '5. Tipos de reclamo (cooperativa electrica)')
    (L 'bullet' 'Corte de energia; cables caidos o peligro; problemas de tension.')
    (L 'bullet' 'Poste inclinado o danado; consumo elevado; alumbrado publico.')
    (L 'bullet' 'Riesgo en via publica; corrimiento de poste; factibilidad de servicio.')
    (L 'bullet' 'Denuncia de fraude anonima; otros.')
    (L 'h1' '6. Inteligencia artificial')
    (L 'bullet' 'Clasificacion y priorizacion de reclamos.')
    (L 'bullet' 'Analisis de reclamos (socios, red, tipos de trabajo).')
    (L 'bullet' 'KPIs sugeridos y asistencia en redaccion.')
    (L 'h1' '7. Valor para la cooperativa')
    (L 'bullet' 'Trazabilidad completa y evidencia de cierre.')
    (L 'bullet' 'Mejor atencion al socio con avisos por WhatsApp.')
    (L 'bullet' 'Base unica para red electrica y calculo SAIDI/SAIFI.')
    (L 'h1' 'Anexo: WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO')
    (L 'p' 'Por defecto: DESACTIVADA (variable 0 o ausente en Render).')
    (L 'p' 'Con valor 1: bloquea nuevos envios masivos solo si hay alerta de ratio bajo sostenido.')
    (L 'p' 'Criterio de alerta: ratio de respuestas menor al 20% durante 3 dias seguidos en ventana de 7 dias.')
)

$muniTable = @(
    @('Panel web', 'Tablero, mapa, asignacion, export Excel, barrios/zonas, geocodificacion.')
    @('Vecinos', 'Catalogo de vecinos, busqueda por identificador, apellido y direccion.')
    @('Incidencias', 'Agrupacion de reclamos y derivacion a terceros (ej. Policia).')
    @('WhatsApp', 'Bot, submenus Transito y Orden publico, masivos, chat humano, STOP/ALTA.')
    @('App Android', 'Pedidos en campo, fotos, cierre, derivacion desde tecnico.')
    @('Estadisticas', 'KPIs, informes, roles de usuario y auditoria.')
)

$muni = @(
    (L 'title' 'GestorNova')
    (L 'subtitle' 'Municipios - Presentacion de producto')
    (L 'p' 'Mayo 2026')
    (L 'h1' 'Resumen ejecutivo')
    (L 'p' 'Sistema para registrar, asignar y cerrar reclamos del vecino con oficina web, cuadrillas en Android y canal WhatsApp.')
    (Lt $muniTable)
    (L 'h1' '1. Publico objetivo')
    (L 'p' 'Municipalidades: alumbrado, bacheo, poda, recoleccion, cloacas, transito, orden publico, espacios verdes, animales, y mas.')
    (L 'h1' '2. Canales')
    (L 'bullet' 'Panel web administrativo (oficina).')
    (L 'bullet' 'WhatsApp para el vecino con menu guiado.')
    (L 'bullet' 'App Android para cuadrillas municipales.')
    (L 'bullet' 'Catalogo de vecinos con busqueda flexible.')
    (L 'h1' '3. Funciones de oficina')
    (L 'bullet' 'Tablero de pedidos y mapa operativo.')
    (L 'bullet' 'Asignacion a cuadrillas y seguimiento de estados.')
    (L 'bullet' 'Exportacion a Excel para reportes.')
    (L 'bullet' 'Incidencias agrupadas y derivacion a terceros.')
    (L 'bullet' 'Gestion de barrios y zonas; geocodificacion y correccion de ubicacion.')
    (L 'bullet' 'Submenus WhatsApp: Transito y Orden publico con subtipos.')
    (L 'bullet' 'Derivacion a Policia (configurable por municipio).')
    (L 'bullet' 'Estadisticas, KPIs, roles (admin, tecnico, supervisor) y auditoria.')
    (L 'h1' '4. App Android')
    (L 'bullet' 'Lista de pedidos asignados y vista en mapa.')
    (L 'bullet' 'Fotos, avances y cierre con evidencia en campo.')
    (L 'bullet' 'Solicitud de derivacion desde el tecnico.')
    (L 'h1' '5. Tipos de reclamo (municipio)')
    (L 'bullet' 'Alumbrado publico; bacheo; recoleccion y poda.')
    (L 'bullet' 'Espacios verdes; cloacas y alcantarillas.')
    (L 'bullet' 'Transito (con subtipos en WhatsApp y panel).')
    (L 'bullet' 'Ruidos molestos; animales; orden publico (con subtipos).')
    (L 'bullet' 'Otros reclamos generales.')
    (L 'h1' '6. Beneficios')
    (L 'bullet' 'Un solo sistema para toda la gestion municipal.')
    (L 'bullet' 'Vecino informado por WhatsApp en cada etapa.')
    (L 'bullet' 'Evidencia documentada para Concejo Deliberante y transparencia.')
    (L 'h1' 'Anexo: WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO')
    (L 'p' 'Por defecto desactivada (0). Con valor 1 bloquea masivos solo si el ratio de respuestas es bajo 3 dias seguidos.')
)

# Plantilla: extraer del docx existente (cualquiera valido como zip)
$seedDoc = Join-Path $outDir 'GestorNova-Municipios.docx'
if (-not (Test-Path (Join-Path $templateDir 'word\styles.xml'))) {
    if (Test-Path $seedDoc) {
        if (Test-Path $templateDir) { Remove-Item $templateDir -Recurse -Force }
        Expand-Docx $seedDoc $templateDir
    }
}

Write-DocxFromLines 'GestorNova-Cooperativa-Electrica.docx' $coop
Write-DocxFromLines 'GestorNova-Municipios.docx' $muni
