package com.gestornova.gestion.tecnico.network

import com.gestornova.gestion.BuildConfig
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.File
import java.util.concurrent.TimeUnit

object ApiClientFactory {

    private const val HTTP_CACHE_MAX_BYTES = 20L * 1024L * 1024L // 20 MB

    private val gson: Gson = GsonBuilder().serializeNulls().create()

    @Volatile
    private var sharedHttpCache: Cache? = null

    /**
     * Inicializa la caché HTTP en disco (ETag / 304 / respuestas GET frecuentes)
     * para reducir llamadas redundantes hacia Render y Neon desde Android.
     */
    @JvmStatic
    fun initHttpCache(baseCacheDir: File?) {
        if (baseCacheDir == null || sharedHttpCache != null) return
        try {
            val dir = File(baseCacheDir, "gn_okhttp_api_cache")
            if (!dir.exists()) dir.mkdirs()
            sharedHttpCache = Cache(dir, HTTP_CACHE_MAX_BYTES)
        } catch (_: Throwable) {
            // Si el almacenamiento local falla, OkHttp continúa operando sin caché en disco.
        }
    }

    fun create(baseUrl: String): GestorNovaApi {
        val logging = HttpLoggingInterceptor().apply {
            level =
                if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC
                else HttpLoggingInterceptor.Level.NONE
        }
        val builder = OkHttpClient.Builder()
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val orig = chain.request()
                val b = orig.newBuilder()
                val t = AuthTokenHolder.get()
                if (!t.isNullOrBlank()) {
                    b.header("Authorization", "Bearer $t")
                }
                if (orig.method.equals("GET", ignoreCase = true) && orig.header("Cache-Control") == null) {
                    b.header("Cache-Control", "max-age=8, stale-while-revalidate=30")
                }
                chain.proceed(b.build())
            }
            .addNetworkInterceptor { chain ->
                val req = chain.request()
                val resp = chain.proceed(req)
                if (
                    req.method.equals("GET", ignoreCase = true) &&
                    resp.isSuccessful &&
                    resp.header("Cache-Control").isNullOrBlank()
                ) {
                    resp.newBuilder()
                        .header("Cache-Control", "private, max-age=8")
                        .build()
                } else {
                    resp
                }
            }
            .addInterceptor(logging)

        sharedHttpCache?.let { builder.cache(it) }

        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(builder.build())
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()

        return retrofit.create(GestorNovaApi::class.java)
    }
}
