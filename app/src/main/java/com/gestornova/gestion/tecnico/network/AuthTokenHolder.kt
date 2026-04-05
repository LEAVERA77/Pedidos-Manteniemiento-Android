package com.gestornova.gestion.tecnico.network

import java.util.concurrent.atomic.AtomicReference

/** Token Bearer para Retrofit (MVP; en memoria + DataStore en [SessionRepository]). */
object AuthTokenHolder {
    private val ref = AtomicReference<String?>(null)

    fun get(): String? = ref.get()

    fun set(token: String?) {
        ref.set(token)
    }
}
