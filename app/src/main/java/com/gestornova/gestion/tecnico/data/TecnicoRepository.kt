package com.gestornova.gestion.tecnico.data

import com.gestornova.gestion.tecnico.network.GestorNovaApi
import com.gestornova.gestion.tecnico.network.LoginRequest
import com.gestornova.gestion.tecnico.network.LoginResponse
import com.gestornova.gestion.tecnico.network.PedidoDto
import com.google.gson.Gson

class TecnicoRepository(
    private val api: GestorNovaApi,
    private val sessionRepository: SessionRepository,
) {

    private val gson = Gson()

    suspend fun login(email: String, password: String): Result<LoginResponse> {
        return try {
            val resp = api.login(LoginRequest(email.trim(), password))
            if (!resp.isSuccessful) {
                val err = resp.errorBody()?.string() ?: resp.message()
                return Result.failure(Exception(parseErrorMessage(err)))
            }
            val body = resp.body() ?: return Result.failure(Exception("Respuesta vacía"))
            sessionRepository.saveSession(body.token, gson.toJson(body.user))
            Result.success(body)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun misPedidos(): Result<List<PedidoDto>> {
        return try {
            Result.success(api.misPedidos())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun pedido(id: Long): Result<PedidoDto> {
        return try {
            Result.success(api.pedidoPorId(id))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logout() {
        sessionRepository.clear()
    }

    private fun parseErrorMessage(raw: String): String {
        return try {
            val o = com.google.gson.JsonParser.parseString(raw).asJsonObject
            o.get("error")?.asString ?: raw
        } catch (_: Exception) {
            raw.ifBlank { "Error de red" }
        }
    }
}
