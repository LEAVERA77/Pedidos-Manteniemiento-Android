package com.gestornova.gestion.tecnico.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.gestornova.gestion.tecnico.network.AuthTokenHolder
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.tecnicoDataStore: DataStore<Preferences> by preferencesDataStore(name = "tecnico_mvp_session")

class SessionRepository(private val context: Context) {

    private val ds = context.tecnicoDataStore

    private object Keys {
        val TOKEN = stringPreferencesKey("jwt_token")
        val USER_JSON = stringPreferencesKey("user_json")
    }

    val tokenFlow: Flow<String?> = ds.data.map { it[Keys.TOKEN] }

    suspend fun loadTokenIntoMemory() {
        val t = ds.data.map { it[Keys.TOKEN] }.first()
        AuthTokenHolder.set(t)
    }

    suspend fun saveSession(token: String, userJson: String) {
        AuthTokenHolder.set(token)
        ds.edit { p ->
            p[Keys.TOKEN] = token
            p[Keys.USER_JSON] = userJson
        }
    }

    suspend fun clear() {
        AuthTokenHolder.set(null)
        ds.edit { it.clear() }
    }
}
