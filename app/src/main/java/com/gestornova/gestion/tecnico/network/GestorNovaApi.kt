package com.gestornova.gestion.tecnico.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface GestorNovaApi {

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    /** Pedidos donde soy técnico asignado o creador (misma semántica que la API). */
    @GET("api/pedidos/mis-pedidos")
    suspend fun misPedidos(): List<PedidoDto>

    @GET("api/pedidos/{id}")
    suspend fun pedidoPorId(@Path("id") id: Long): PedidoDto
}
