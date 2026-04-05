package com.gestornova.gestion.tecnico.network

import com.gestornova.gestion.BuildConfig
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClientFactory {

    private val gson: Gson = GsonBuilder().serializeNulls().create()

    fun create(baseUrl: String): GestorNovaApi {
        val logging = HttpLoggingInterceptor().apply {
            level =
                if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC
                else HttpLoggingInterceptor.Level.NONE
        }
        val client = OkHttpClient.Builder()
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val b = chain.request().newBuilder()
                val t = AuthTokenHolder.get()
                if (!t.isNullOrBlank()) {
                    b.header("Authorization", "Bearer $t")
                }
                chain.proceed(b.build())
            }
            .addInterceptor(logging)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()

        return retrofit.create(GestorNovaApi::class.java)
    }
}
