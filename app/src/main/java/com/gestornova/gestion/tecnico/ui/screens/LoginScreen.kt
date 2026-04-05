package com.gestornova.gestion.tecnico.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material3.Icon
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gestornova.gestion.BuildConfig
import com.gestornova.gestion.MainActivity
import com.gestornova.gestion.R
import com.gestornova.gestion.tecnico.ui.TecnicoViewModel

// Alineado con styles.css (#ls, .lc, .ll, .dbs, .ig, .bp)

private val ColorBgStart = Color(0xFF0F172A)
private val ColorBgMid = Color(0xFF1E3A8A)
private val ColorBgEnd = Color(0xFF2563EB)
private val ColorBd = Color(0xFF1E3A8A)
private val ColorBm = Color(0xFF2563EB)
private val ColorBl = Color(0xFF3B82F6)
private val ColorTd = Color(0xFF1E293B)
private val ColorTm = Color(0xFF475569)
private val ColorTl = Color(0xFF94A3B8)
private val ColorBo = Color(0xFFE2E8F0)

private val DbsOkBg = Color(0xFFDCFCE7)
private val DbsOkFg = Color(0xFF166534)
private val DbsErrBg = Color(0xFFFEE2E2)
private val DbsErrFg = Color(0xFF991B1B)
private val DbsCheckBg = Color(0xFFFEF9C3)
private val DbsCheckFg = Color(0xFF854D0E)

@Composable
fun GestorNovaLoginGradientBackground(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colorStops = arrayOf(
                        0f to ColorBgStart,
                        0.5f to ColorBgMid,
                        1f to ColorBgEnd,
                    ),
                    start = Offset(0f, 0f),
                    end = Offset(900f, 1200f),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

@Composable
fun LoginScreen(
    vm: TecnicoViewModel,
    onLoggedIn: () -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val ctx = LocalContext.current

    GestorNovaLoginGradientBackground {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth(0.92f)
                    .widthIn(max = 420.dp),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 16.dp),
            ) {
                Column(
                    Modifier.padding(start = 32.dp, end = 32.dp, top = 32.dp, bottom = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(ColorBd, ColorBl),
                                    start = Offset(0f, 0f),
                                    end = Offset(120f, 120f),
                                ),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "GN",
                            color = Color.White,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        stringResource(R.string.tecnico_mvp_login_titulo),
                        style = MaterialTheme.typography.headlineSmall.copy(
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                            color = ColorTd,
                        ),
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        stringResource(R.string.tecnico_mvp_login_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = ColorTm,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
                    )

                    LoginStatusPill(
                        loading = vm.loginLoading,
                        errorMessage = vm.bannerError,
                        onDismissError = { vm.clearBanner() },
                    )

                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text(stringResource(R.string.tecnico_mvp_email)) },
                        leadingIcon = {
                            IconTinted(Icons.Outlined.Email, ColorTl)
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ColorBl,
                            unfocusedBorderColor = ColorBo,
                            focusedLabelColor = ColorBl,
                            unfocusedLabelColor = ColorTm,
                            cursorColor = ColorBl,
                            focusedLeadingIconColor = ColorTl,
                            unfocusedLeadingIconColor = ColorTl,
                        ),
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text(stringResource(R.string.tecnico_mvp_password)) },
                        leadingIcon = {
                            IconTinted(Icons.Outlined.Lock, ColorTl)
                        },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ColorBl,
                            unfocusedBorderColor = ColorBo,
                            focusedLabelColor = ColorBl,
                            unfocusedLabelColor = ColorTm,
                            cursorColor = ColorBl,
                            focusedLeadingIconColor = ColorTl,
                            unfocusedLeadingIconColor = ColorTl,
                        ),
                    )
                    Spacer(Modifier.height(20.dp))

                    if (!vm.loginLoading) {
                        val canSubmit = email.isNotBlank() && password.isNotBlank()
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (canSubmit) {
                                        Brush.linearGradient(
                                            colors = listOf(ColorBd, ColorBm),
                                            start = Offset(0f, 0f),
                                            end = Offset(200f, 200f),
                                        )
                                    } else {
                                        Brush.linearGradient(
                                            colors = listOf(ColorBd.copy(alpha = 0.45f), ColorBm.copy(alpha = 0.45f)),
                                            start = Offset(0f, 0f),
                                            end = Offset(200f, 200f),
                                        )
                                    },
                                )
                                .clickable(enabled = canSubmit) {
                                    vm.login(email, password)
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Outlined.Login,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(22.dp),
                                )
                                Spacer(Modifier.size(8.dp))
                                Text(
                                    stringResource(R.string.tecnico_mvp_ingresar),
                                    color = Color.White,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    } else {
                        Spacer(Modifier.height(52.dp))
                    }

                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.tecnico_mvp_forgot_password),
                        color = ColorBl,
                        fontSize = 14.sp,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier
                            .padding(top = 8.dp)
                            .clickable {
                                ctx.startActivity(
                                    Intent(ctx, MainActivity::class.java).apply {
                                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                                    },
                                )
                            },
                    )
                    Text(
                        stringResource(R.string.tecnico_mvp_version, BuildConfig.VERSION_NAME),
                        color = ColorTm,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
            TextButton(
                onClick = {
                    ctx.startActivity(
                        Intent(ctx, MainActivity::class.java).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        },
                    )
                },
            ) {
                Text(
                    stringResource(R.string.tecnico_mvp_app_completa),
                    color = Color.White.copy(alpha = 0.92f),
                )
            }
        }
    }

    LaunchedEffect(vm.hasToken) {
        if (vm.hasToken) onLoggedIn()
    }
}

@Composable
private fun IconTinted(imageVector: ImageVector, tint: Color) {
    Icon(
        imageVector = imageVector,
        contentDescription = null,
        tint = tint,
        modifier = Modifier.size(22.dp),
    )
}

@Composable
private fun LoginStatusPill(
    loading: Boolean,
    errorMessage: String?,
    onDismissError: () -> Unit,
) {
    val bg: Color
    val fg: Color
    val text: String
    val showSpinner: Boolean

    when {
        errorMessage != null -> {
            bg = DbsErrBg
            fg = DbsErrFg
            text = errorMessage
            showSpinner = false
        }
        loading -> {
            bg = DbsCheckBg
            fg = DbsCheckFg
            text = stringResource(R.string.tecnico_mvp_login_signing_in)
            showSpinner = true
        }
        else -> {
            bg = DbsOkBg
            fg = DbsOkFg
            text = stringResource(R.string.tecnico_mvp_login_status_ok)
            showSpinner = false
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(50))
            .background(bg)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = if (errorMessage != null) {
            Arrangement.SpaceBetween
        } else {
            Arrangement.Center
        },
    ) {
        if (showSpinner) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = fg,
            )
            Spacer(Modifier.size(10.dp))
        }
        Text(
            text,
            color = fg,
            fontSize = 13.sp,
            textAlign = if (errorMessage != null) TextAlign.Start else TextAlign.Center,
            modifier = if (errorMessage != null) Modifier.weight(1f).padding(end = 8.dp) else Modifier,
        )
        if (errorMessage != null) {
            Text(
                "OK",
                color = fg,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                modifier = Modifier.clickable { onDismissError() },
            )
        }
    }
    Spacer(Modifier.height(20.dp))
}
