package com.gestornova.gestion.tecnico.ui

import android.content.Intent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.gestornova.gestion.MainActivity
import com.gestornova.gestion.R
import com.gestornova.gestion.tecnico.ui.screens.GestorNovaLoginGradientBackground
import com.gestornova.gestion.tecnico.ui.screens.LoginScreen
import com.gestornova.gestion.tecnico.ui.screens.PedidoDetailScreen
import com.gestornova.gestion.tecnico.ui.screens.PedidoListScreen

private const val RouteLogin = "login"
private const val RouteLista = "lista"
private const val RouteDetalle = "detalle/{id}"

private val ColorTd = Color(0xFF1E293B)
private val ColorBm = Color(0xFF2563EB)

@Composable
fun TecnicoRoot(vm: TecnicoViewModel) {
    val ctx = LocalContext.current
    when {
        vm.loadingConfig -> {
            GestorNovaLoginGradientBackground {
                Card(
                    modifier = Modifier
                        .fillMaxWidth(0.92f)
                        .widthIn(max = 420.dp),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 16.dp),
                ) {
                    Box(
                        Modifier
                            .padding(48.dp)
                            .fillMaxWidth(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = ColorBm)
                    }
                }
            }
        }
        vm.configError != null -> {
            GestorNovaLoginGradientBackground {
                Card(
                    modifier = Modifier
                        .fillMaxWidth(0.92f)
                        .widthIn(max = 420.dp),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 16.dp),
                ) {
                    Column(
                        Modifier.padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            stringResource(R.string.tecnico_mvp_login_titulo),
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                            color = ColorTd,
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            vm.configError!!,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center,
                        )
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
                            Text(stringResource(R.string.tecnico_mvp_app_completa))
                        }
                    }
                }
            }
        }
        else -> {
            val navController = rememberNavController()
            val start = if (vm.hasToken) RouteLista else RouteLogin
            NavHost(
                navController = navController,
                startDestination = start,
            ) {
                composable(RouteLogin) {
                    LoginScreen(
                        vm = vm,
                        onLoggedIn = {
                            navController.navigate(RouteLista) {
                                popUpTo(RouteLogin) { inclusive = true }
                            }
                        },
                    )
                }
                composable(RouteLista) {
                    LaunchedEffect(Unit) {
                        vm.refreshPedidos()
                    }
                    PedidoListScreen(
                        vm = vm,
                        onOpenPedido = { id ->
                            navController.navigate("detalle/$id")
                        },
                        onLogout = {
                            vm.logout()
                            navController.navigate(RouteLogin) {
                                popUpTo(0) { inclusive = true }
                            }
                        },
                    )
                }
                composable(
                    RouteDetalle,
                    arguments = listOf(navArgument("id") { type = NavType.LongType }),
                ) { entry ->
                    val id = entry.arguments?.getLong("id") ?: return@composable
                    PedidoDetailScreen(
                        vm = vm,
                        pedidoId = id,
                        onBack = {
                            vm.clearDetalle()
                            navController.popBackStack()
                        },
                    )
                }
            }
        }
    }
}
