package com.gestornova.gestion.tecnico.data

import android.content.Context
import android.util.Log
import com.gestornova.gestion.R
import com.google.gson.JsonParseException
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Mensajes para el usuario y registro en log a partir de fallos de red/API.
 */
object TecnicoErrorMapper {

    private const val TAG = "GestorNova/Tecnico"

    fun userMessage(context: Context, throwable: Throwable): String {
        return when (throwable) {
            is CancellationException -> throw throwable
            is HttpException -> ApiErrorParser.messageFromHttpException(throwable)
            is UnknownHostException -> context.getString(R.string.error_red_sin_dns)
            is SocketTimeoutException -> context.getString(R.string.error_red_timeout)
            is SSLException -> context.getString(R.string.error_red_ssl)
            is JsonParseException -> context.getString(R.string.error_red_datos_invalidos)
            is IOException -> context.getString(R.string.error_red_io)
            else -> throwable.message?.trim()?.takeIf { it.isNotEmpty() }
                ?: context.getString(R.string.tecnico_mvp_error_generico)
        }
    }

    fun log(tag: String, stage: String, throwable: Throwable) {
        if (throwable is CancellationException) return
        val msg = buildLogMessage(stage, throwable)
        when (throwable) {
            is HttpException -> Log.w(tag, msg)
            else -> Log.e(tag, msg, throwable)
        }
    }

    private fun buildLogMessage(stage: String, t: Throwable): String {
        val detail = when (t) {
            is HttpException -> "HTTP ${t.code()} ${t.message()}"
            else -> t.message ?: t.javaClass.simpleName
        }
        return "[$stage] $detail"
    }
}
