package com.gestornova.gestion.tecnico.ui.screens

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.gestornova.gestion.MainActivity
import com.gestornova.gestion.R
import com.gestornova.gestion.tecnico.network.PedidoDto
import com.gestornova.gestion.tecnico.ui.TecnicoViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PedidoListScreen(
    vm: TecnicoViewModel,
    onOpenPedido: (Long) -> Unit,
    onLogout: () -> Unit,
) {
    val ctx = LocalContext.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.tecnico_mvp_lista_titulo)) },
                actions = {
                    TextButton(
                        onClick = { vm.refreshPedidos() },
                        enabled = !vm.loadingPedidos,
                    ) {
                        Text(stringResource(R.string.tecnico_mvp_refrescar))
                    }
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
                    TextButton(onClick = onLogout) {
                        Text(stringResource(R.string.tecnico_mvp_logout))
                    }
                },
            )
        },
    ) { inner ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(inner),
        ) {
            vm.bannerError?.let { err ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        err,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { vm.clearBanner() }) { Text("OK") }
                }
            }
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) {
                when {
                    vm.loadingPedidos && vm.pedidos.isEmpty() -> {
                        CircularProgressIndicator(Modifier.align(Alignment.Center))
                    }
                    vm.pedidos.isEmpty() -> {
                        Text(
                            stringResource(R.string.tecnico_mvp_sin_pedidos),
                            modifier = Modifier
                                .align(Alignment.Center)
                                .padding(24.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                    else -> {
                        LazyColumn(Modifier.fillMaxSize()) {
                            items(vm.pedidos, key = { it.id }) { p ->
                                PedidoRow(pedido = p, onClick = { onOpenPedido(p.id) })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PedidoRow(
    pedido: PedidoDto,
    onClick: () -> Unit,
) {
    ListItem(
        headlineContent = {
            Text(pedido.numeroPedido ?: "#${pedido.id}")
        },
        supportingContent = {
            Text(
                listOfNotNull(pedido.estado, pedido.clienteNombre ?: pedido.cliente, pedido.distribuidor)
                    .joinToString(" · ")
                    .ifBlank { "—" },
            )
        },
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    )
}
