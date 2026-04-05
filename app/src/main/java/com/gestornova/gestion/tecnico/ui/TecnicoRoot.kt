package com.gestornova.gestion.tecnico.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.gestornova.gestion.R
import com.gestornova.gestion.tecnico.ui.screens.LoginScreen
import com.gestornova.gestion.tecnico.ui.screens.PedidoDetailScreen
import com.gestornova.gestion.tecnico.ui.screens.PedidoListScreen

private const val RouteLogin = "login"
private const val RouteLista = "lista"
private const val RouteDetalle = "detalle/{id}"

@Composable
fun TecnicoRoot(vm: TecnicoViewModel) {
    when {
        vm.loadingConfig -> {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        vm.configError != null -> {
            Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Text(
                    vm.configError!!,
                    style = MaterialTheme.typography.bodyLarge,
                )
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
