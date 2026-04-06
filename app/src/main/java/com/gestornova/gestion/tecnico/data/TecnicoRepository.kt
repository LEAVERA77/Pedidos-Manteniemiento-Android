package com.gestornova.gestion.tecnico.data

import com.gestornova.gestion.tecnico.network.GestorNovaApi
import com.gestornova.gestion.tecnico.network.LoginRequest
import com.gestornova.gestion.tecnico.network.LoginResponse
import com.gestornova.gestion.tecnico.network.PedidoDto
import com.google.gson.Gson
import kotlinx.coroutines.CancellationException

class TecnicoRepository(
    private val api: GestorNovaApi,
    private val sessionRepository: SessionRepository,
) {

    private val gson = Gson()

    suspend fun login(email: String, password: String): Result<LoginResponse> {
        return try {
            val resp = api.login(LoginRequest(email.trim(), password))
            if (!resp.isSuccessful) {
                val err = resp.errorBody()?.string().orEmpty().ifBlank { resp.message() }
                val msg = ApiErrorParser.parseErrorBody(err).ifBlank { "Error HTTP ${resp.code()}" }
                return Result.failure(Exception(msg))
            }
            val body = resp.body() ?: return Result.failure(Exception("Respuesta vacía"))
            sessionRepository.saveSession(body.token, gson.toJson(body.user))
            Result.success(body)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun misPedidos(): Result<List<PedidoDto>> {
        return try {
            Result.success(api.misPedidos())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun pedido(id: Long): Result<PedidoDto> {
        return try {
            Result.success(api.pedidoPorId(id))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logout() {
        sessionRepository.clear()
    }
}
