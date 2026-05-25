# Genera documentos Word de presentacion GestorNova.
# Requiere Microsoft Word. Salida: docs/presentacion/*.docx

$ErrorActionPreference = 'Stop'
$outDir = Join-Path $PSScriptRoot '..\presentacion'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function Add-Line($doc, $text, $style) {
    $p = $doc.Paragraphs.Add()
    $p.Range.Text = [string]$text
    if ($style -eq 'title') {
        $p.Range.Font.Size = 22
        $p.Range.Font.Bold = -1
        $p.Range.ParagraphFormat.SpaceAfter = 12
    } elseif ($style -eq 'h1') {
        $p.Range.Font.Size = 14
        $p.Range.Font.Bold = -1
        $p.Range.ParagraphFormat.SpaceBefore = 10
        $p.Range.ParagraphFormat.SpaceAfter = 6
    } elseif ($style -eq 'h2') {
        $p.Range.Font.Size = 12
        $p.Range.Font.Bold = -1
        $p.Range.ParagraphFormat.SpaceAfter = 4
    } else {
        $p.Range.Font.Size = 11
        $p.Range.ParagraphFormat.SpaceAfter = 4
    }
    if ($style -eq 'bullet') { $p.Range.ListFormat.ApplyBulletDefault() | Out-Null }
    $null = $p.Range.InsertParagraphAfter()
}

function Save-Doc($doc, $filePath) {
    $full = [System.IO.Path]::GetFullPath($filePath)
    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Force }
    $wdFormatXMLDocument = 12
    $doc.SaveAs2($full, $wdFormatXMLDocument)
}

$coop = @(
    @('title', 'GestorNova')
    @('p', 'Plataforma integral de gestion de reclamos y operacion en campo')
    @('p', 'Version para Cooperativa Electrica - Documento de presentacion')
    @('p', 'Mayo 2026')
    @('h1', '1. Que es GestorNova')
    @('p', 'GestorNova centraliza el ciclo del reclamo: ingreso por web, app o WhatsApp, asignacion en mapa, trabajo de cuadrilla en Android, cierre con evidencias y comunicacion al socio.')
    @('h1', '2. Publico objetivo - Cooperativa electrica')
    @('p', 'Cooperativas y distribuidoras electricas: cortes, tension, postes, cables, alumbrado, fraude, vinculo con red y metricas SAIDI/SAIFI.')
    @('h1', '3. Canales de ingreso')
    @('bullet', 'Panel web administrador')
    @('bullet', 'WhatsApp con menu guiado para el socio')
    @('bullet', 'App Android para cuadrillas')
    @('bullet', 'Catalogo de socios NIS y medidor')
    @('h1', '4. Funciones oficina - Pedidos')
    @('bullet', 'Listado y mapa con filtros por estado, tipo, prioridad y zona')
    @('bullet', 'Detalle con avances, fotos, materiales, firma y cierre')
    @('bullet', 'Asignacion a cuadrillas y notificacion push')
    @('bullet', 'Priorizacion sugerida por IA y deteccion de duplicados')
    @('bullet', 'Exportacion Excel y correccion de geocodificacion')
    @('h2', '4.2 Red electrica e indicadores')
    @('bullet', 'Importacion Excel Red Electrica: distribuidores, tension kV, trafos, KVA, clientes')
    @('bullet', 'Select Dist. en pedido nuevo desde distribuidores_red')
    @('bullet', 'Estadisticas SAIDI y SAIFI')
    @('h2', '4.3 Socios y catalogo')
    @('bullet', 'Importacion masiva Excel')
    @('bullet', 'Busqueda NIS y domicilio al crear pedido')
    @('bullet', 'Opt-in avisos masivos STOP/ALTA')
    @('h2', '4.4 Derivacion e incidencias')
    @('bullet', 'Derivacion a terceros y solicitud desde tecnico')
    @('bullet', 'Incidencias agrupadas y clientes afectados')
    @('h2', '4.5 WhatsApp')
    @('bullet', 'Bot reclamos, consulta mis reclamos, fraude anonimo')
    @('bullet', 'Avisos automaticos en ejecucion, avance y cierre')
    @('bullet', 'Avisos masivos comunidad y corte programado')
    @('bullet', 'Chat humano y generacion de texto con IA')
    @('h2', '4.6 Administracion')
    @('bullet', 'Usuarios admin, tecnico, supervisor')
    @('bullet', 'Configuracion empresa y multitenant aislado')
    @('bullet', 'Estadisticas, KPIs e informes')
    @('h1', '5. App Android cuadrillas')
    @('bullet', 'Lista y mapa GPS, fotos, avances, cierre offline')
    @('bullet', 'Materiales y firma del socio')
    @('h1', '6. Tipos de reclamo cooperativa electrica')
    @('bullet', 'Corte de Energia; Cables Caidos/Peligro; Problemas de Tension')
    @('bullet', 'Poste Inclinado/Danado; Consumo elevado; Alumbrado Publico')
    @('bullet', 'Riesgo en via publica; Corrimiento de poste; Factibilidad')
    @('bullet', 'Denuncia de fraude anonima; Otros')
    @('h1', '7. Inteligencia artificial')
    @('bullet', 'Clasificacion, priorizacion, analisis de reclamos, KPIs sugeridos')
    @('h1', '8. Valor para la cooperativa')
    @('bullet', 'Trazabilidad, evidencia de cierre, mejor atencion al socio')
    @('bullet', 'Base unica para red y SAIDI/SAIFI')
    @('h1', 'Anexo WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO')
    @('p', 'Estado por defecto: DESACTIVADA (0 o variable ausente en Render).')
    @('p', 'Con valor 1: bloquea nuevos masivos solo si hay alerta de ratio bajo sostenido.')
    @('p', 'Criterio alerta: ratio respuestas menor a 20 por ciento durante 3 dias seguidos en ventana 7 dias.')
    @('p', 'Consulta: GET /api/whatsapp/broadcast/metrics campo guards.block_on_low_ratio y low_ratio_alert.')
)

$muni = @(
    @('title', 'GestorNova')
    @('p', 'Plataforma integral de gestion de reclamos municipales')
    @('p', 'Version para Municipios - Documento de presentacion')
    @('p', 'Mayo 2026')
    @('h1', '1. Que es GestorNova')
    @('p', 'Sistema para registrar, asignar y cerrar reclamos del vecino con oficina web, cuadrillas Android y WhatsApp.')
    @('h1', '2. Publico objetivo - Municipio')
    @('p', 'Alumbrado, bacheo, poda, recoleccion, cloacas, transito, orden publico, espacios verdes, animales.')
    @('h1', '3. Canales')
    @('bullet', 'Web administrativa; WhatsApp; App Android; catalogo vecinos')
    @('h1', '4. Funciones oficina')
    @('bullet', 'Tablero y mapa; asignacion; export Excel')
    @('bullet', 'Incidencias agrupadas y derivacion a terceros')
    @('bullet', 'Barrios/zonas y geocodificacion')
    @('bullet', 'Submenus WhatsApp Transito y Orden publico')
    @('bullet', 'Derivacion a Policia configurable')
    @('bullet', 'Estadisticas, KPIs, roles y auditoria')
    @('h1', '5. App Android')
    @('bullet', 'Pedidos en campo, fotos, cierre, derivacion tecnico')
    @('h1', '6. Tipos de reclamo municipio')
    @('bullet', 'Alumbrado; Bacheo; Recoleccion/Poda; Espacios Verdes')
    @('bullet', 'Cloacas y alcantarillas; Transito con subtipos')
    @('bullet', 'Ruidos; Animales; Orden publico con subtipos; Otros')
    @('h1', '7. Beneficios')
    @('bullet', 'Un solo sistema; vecino informado; evidencia para Concejo')
    @('h1', 'Anexo WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO')
    @('p', 'Por defecto 0. Con 1 bloquea masivos si ratio de respuestas bajo 3 dias seguidos.')
)

$docs = @{
    'GestorNova-Cooperativa-Electrica.docx' = $coop
    'GestorNova-Municipios.docx'              = $muni
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    foreach ($name in $docs.Keys) {
        $lines = $docs[$name]
        $doc = $word.Documents.Add()
        foreach ($line in $lines) {
            Add-Line $doc $line[1] $line[0]
        }
        $path = Join-Path $outDir $name
        Save-Doc $doc $path
        $doc.Close($false) | Out-Null
        Write-Host "OK $path"
    }
} finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}
