package com.gestornova.gestion.tecnico.network

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    val email: String,
    val password: String,
)

data class LoginResponse(
    val token: String,
    val user: UserDto,
)

data class UserDto(
    val id: Long,
    val email: String?,
    val nombre: String?,
    val rol: String?,
)

/** Columnas alineadas con la API Node (filas PostgreSQL). */
data class PedidoDto(
    @SerializedName("id") val id: Long = 0,
    @SerializedName("numero_pedido") val numeroPedido: String? = null,
    @SerializedName("estado") val estado: String? = null,
    @SerializedName("descripcion") val descripcion: String? = null,
    @SerializedName("prioridad") val prioridad: String? = null,
    @SerializedName("avance") val avance: Int? = null,
    @SerializedName("fecha_creacion") val fechaCreacion: String? = null,
    @SerializedName("fecha_cierre") val fechaCierre: String? = null,
    @SerializedName("fecha_avance") val fechaAvance: String? = null,
    @SerializedName("distribuidor") val distribuidor: String? = null,
    /** Compatibilidad API/Neon: pedidos viejos solo tenían setd; la UI muestra todo como Trafo. */
    @SerializedName("setd") val setd: String? = null,
    @SerializedName("trafo") val trafo: String? = null,
    @SerializedName("cliente") val cliente: String? = null,
    @SerializedName("cliente_nombre") val clienteNombre: String? = null,
    @SerializedName("cliente_calle") val clienteCalle: String? = null,
    @SerializedName("cliente_numero_puerta") val clienteNumeroPuerta: String? = null,
    @SerializedName("cliente_localidad") val clienteLocalidad: String? = null,
    @SerializedName("tipo_trabajo") val tipoTrabajo: String? = null,
    @SerializedName("trabajo_realizado") val trabajoRealizado: String? = null,
    @SerializedName("tecnico_cierre") val tecnicoCierre: String? = null,
    @SerializedName("nis_medidor") val nisMedidor: String? = null,
    @SerializedName("nis") val nis: String? = null,
    @SerializedName("cliente_direccion") val clienteDireccion: String? = null,
    @SerializedName("suministro_tipo_conexion") val suministroTipoConexion: String? = null,
    @SerializedName("suministro_fases") val suministroFases: String? = null,
    @SerializedName("tecnico_asignado_id") val tecnicoAsignadoId: Long? = null,
    @SerializedName("telefono_contacto") val telefonoContacto: String? = null,
    /** Texto libre que envía el cliente por WhatsApp tras el aviso de cierre. */
    @SerializedName("opinion_cliente") val opinionCliente: String? = null,
    @SerializedName("fecha_opinion_cliente") val fechaOpinionCliente: String? = null,
    @SerializedName("lat") val lat: Double? = null,
    @SerializedName("lng") val lng: Double? = null,
    @SerializedName("fotos") val fotos: List<String>? = null,
)
