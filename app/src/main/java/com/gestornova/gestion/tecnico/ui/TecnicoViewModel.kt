package com.gestornova.gestion.tecnico.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.gestornova.gestion.tecnico.config.ApiConfigLoader
import com.gestornova.gestion.tecnico.data.SessionRepository
import com.gestornova.gestion.tecnico.data.TecnicoRepository
import com.gestornova.gestion.tecnico.network.ApiClientFactory
import com.gestornova.gestion.tecnico.network.AuthTokenHolder
import com.gestornova.gestion.tecnico.network.GestorNovaApi
import com.gestornova.gestion.tecnico.network.PedidoDto
import kotlinx.coroutines.launch
import retrofit2.HttpException

class TecnicoViewModel(
    appContext: Context,
) : ViewModel() {

    private val ctx = appContext.applicationContext
    private val sessionRepository = SessionRepository(ctx)
    private var api: GestorNovaApi? = null

    var loadingConfig by mutableStateOf(true)
        private set
    var configError by mutableStateOf<String?>(null)
        private set
    var hasToken by mutableStateOf(false)
        private set

    var pedidos by mutableStateOf<List<PedidoDto>>(emptyList())
        private set
    var loadingPedidos by mutableStateOf(false)
        private set
    var pedidoDetalle by mutableStateOf<PedidoDto?>(null)
        private set
    var loadingDetalle by mutableStateOf(false)
        private set

    var bannerError by mutableStateOf<String?>(null)
        private set
    var loginLoading by mutableStateOf(false)
        private set

    private fun repo(): TecnicoRepository? {
        val a = api ?: return null
        return TecnicoRepository(a, sessionRepository)
    }

    init {
        viewModelScope.launch {
            sessionRepository.loadTokenIntoMemory()
            hasToken = !AuthTokenHolder.get().isNullOrBlank()
            val base = ApiConfigLoader.loadBaseUrl(ctx)
            loadingConfig = false
            if (base == null) {
                configError = ctx.getString(com.gestornova.gestion.R.string.tecnico_mvp_config_falta_api)
            } else {
                api = ApiClientFactory.create(base)
            }
        }
    }

    fun clearBanner() {
        bannerError = null
    }

    fun login(email: String, password: String) {
        val r = repo() ?: return
        loginLoading = true
        bannerError = null
        viewModelScope.launch {
            val res = r.login(email, password)
            loginLoading = false
            res.onSuccess {
                hasToken = true
                refreshPedidos()
            }.onFailure {
                bannerError = it.message ?: ctx.getString(com.gestornova.gestion.R.string.tecnico_mvp_error_generico)
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repo()?.logout()
            hasToken = false
            pedidos = emptyList()
            pedidoDetalle = null
        }
    }

    fun refreshPedidos() {
        val r = repo() ?: return
        loadingPedidos = true
        bannerError = null
        viewModelScope.launch {
            val res = r.misPedidos()
            loadingPedidos = false
            res.onSuccess { pedidos = it }
                .onFailure {
                    bannerError = it.message ?: ctx.getString(com.gestornova.gestion.R.string.tecnico_mvp_error_generico)
                    val code = (it as? HttpException)?.code()
                    if (code == 401 || code == 403) {
                        logout()
                    }
                }
        }
    }

    fun loadPedido(id: Long) {
        val r = repo() ?: return
        loadingDetalle = true
        pedidoDetalle = null
        bannerError = null
        viewModelScope.launch {
            val res = r.pedido(id)
            loadingDetalle = false
            res.onSuccess { pedidoDetalle = it }
                .onFailure {
                    bannerError = it.message ?: ctx.getString(com.gestornova.gestion.R.string.tecnico_mvp_error_generico)
                }
        }
    }

    fun clearDetalle() {
        pedidoDetalle = null
    }

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return TecnicoViewModel(context.applicationContext) as T
                }
            }
    }
}
