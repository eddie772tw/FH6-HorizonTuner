package org.horizontuner.companion.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = HalfmoonPrimary,
    background = HalfmoonDarkBg,
    surface = HalfmoonDarkSurface,
    surfaceVariant = HalfmoonDarkSurfaceVariant,
    onPrimary = HalfmoonTextPrimary,
    onBackground = HalfmoonTextPrimary,
    onSurface = HalfmoonTextPrimary,
    outline = HalfmoonBorder,
    error = HalfmoonDanger,
    secondary = HalfmoonTextSecondary
)

private val LightColorScheme = lightColorScheme(
    primary = HalfmoonPrimary,
    background = Color(0xFFF8F9FA),
    surface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFFE9ECEF),
    outline = Color(0xFFDEE2E6),
    error = HalfmoonDanger,
    secondary = Color(0xFF6C757D)
)

@Composable
fun HalfmoonTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
