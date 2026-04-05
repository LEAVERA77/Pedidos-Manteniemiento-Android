package com.gestornova.gestion.tecnico.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.gestornova.gestion.R
import com.gestornova.gestion.tecnico.network.PedidoDto
import com.gestornova.gestion.tecnico.ui.TecnicoViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PedidoDetailScreen(
    vm: TecnicoViewModel,
    pedidoId: Long,
    onBack: () -> Unit,
) {
    LaunchedEffect(pedidoId) {
        vm.loadPedido(pedidoId)
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.tecnico_mvp_detalle_titulo)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.tecnico_mvp_volver),
                        )
                    }
                },
            )
        },
    ) { inner ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(inner)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            when {
                vm.loadingDetalle && vm.pedidoDetalle == null -> {
                    Spacer(Modifier.height(32.dp))
                    CircularProgressIndicator()
                }
                vm.pedidoDetalle != null -> {
                    DetalleBody(vm.pedidoDetalle!!)
                }
                else -> {
                    Text(stringResource(R.string.tecnico_mvp_error_generico))
                }
            }
        }
    }
}

@Composable
private fun DetalleBody(p: PedidoDto) {
    DetailLine(stringResource(R.string.tecnico_mvp_numero), p.numeroPedido ?: "#${p.id}")
    DetailLine(stringResource(R.string.tecnico_mvp_estado), p.estado)
    DetailLine(stringResource(R.string.tecnico_mvp_cliente), p.cliente)
    DetailLine(stringResource(R.string.tecnico_mvp_distribuidor), p.distribuidor)
    DetailLine(stringResource(R.string.tecnico_mvp_descripcion), p.descripcion)
    DetailLine(stringResource(R.string.tecnico_mvp_prioridad), p.prioridad)
    p.avance?.let { DetailLine(stringResource(R.string.tecnico_mvp_avance), "$it%") }
    DetailLine(stringResource(R.string.tecnico_mvp_tipo_trabajo), p.tipoTrabajo)
    DetailLine(stringResource(R.string.tecnico_mvp_trabajo_realizado), p.trabajoRealizado)
    DetailLine(stringResource(R.string.tecnico_mvp_fecha_creacion), p.fechaCreacion)
    DetailLine(stringResource(R.string.tecnico_mvp_telefono), p.telefonoContacto)
    DetailLine(stringResource(R.string.tecnico_mvp_nis), p.nisMedidor)
}

@Composable
private fun DetailLine(title: String, value: String?) {
    if (value.isNullOrBlank()) return
    Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
    Text(value, style = MaterialTheme.typography.bodyMedium)
    Spacer(Modifier.height(12.dp))
}
