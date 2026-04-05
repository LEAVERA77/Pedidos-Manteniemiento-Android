package com.gestornova.gestion.tecnico.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Navy = Color(0xFF1E3A8A)
private val Blue = Color(0xFF2563EB)

private val LightColors = lightColorScheme(
    primary = Navy,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDBEAFE),
    secondary = Blue,
    onSecondary = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF93C5FD),
    onPrimary = Color(0xFF0F172A),
    secondary = Color(0xFF60A5FA),
    onSecondary = Color(0xFF0F172A),
)

@Composable
fun GestorNovaTecnicoTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        content = content,
    )
}
