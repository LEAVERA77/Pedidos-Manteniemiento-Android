# Autorización Rápida: Render → Pedidos-MG

## 🎯 Objetivo
Permitir que Render vea el repo `Pedidos-MG` (2 minutos, 5 clicks)

## 📝 Pasos (SOLO desde navegador)

### Opción A: Desde GitHub (Recomendado)

1. **Abrir GitHub Settings:**
   ```
   https://github.com/settings/installations
   ```

2. **Click en "Render"** (debería aparecer en la lista)

3. **Click en "Configure"** (botón verde)

4. **Buscar "Repository access"**
   - Selecciona: **"All repositories"** (más simple)
   - O si prefieres: **"Only select repositories"** → Marca `Pedidos-MG`

5. **Click en "Save"**

---

### Opción B: Desde Render (Alternativa)

1. **Dashboard Render:**
   ```
   https://dashboard.render.com/
   ```

2. **Settings** del servicio de API

3. **"Repository"** → **"Update Repository"**

4. **"Configure account"** (link arriba a la derecha)
   - Te redirige a GitHub
   - Sigue los pasos de "Opción A" desde el punto 4

---

## ✅ Verificación

Después de guardar:

1. **Vuelve a Render** → **"Update Repository"**
2. **Deberías ver ahora:**
   - `LEAVERA77/Pedidos-Manteniemiento-Android`
   - `LEAVERA77/Pedidos-MG` ← **NUEVO**

3. **Click en "Connect"** junto a `Pedidos-MG`

4. **Configurar Root Directory:**
   - Root Directory: `api`
   - Build Command: `npm install`
   - Start Command: `npm start`

5. **Click en "Save"**

6. **Manual Deploy** → **"Clear build cache & deploy"**

---

## 🔑 Resumen

- **No se puede hacer desde CLI** (requiere OAuth web)
- **Solo Pedidos-MG en Render** (no necesitas dos servicios)
- **5 clicks, 2 minutos máximo**

---

## 🆘 Si no aparece Render en GitHub Settings

Entonces la app nunca se instaló:

1. Ve a: https://github.com/apps/render
2. Click en **"Install"**
3. Selecciona tu cuenta `LEAVERA77`
4. Elige repos (All o solo `Pedidos-MG`)
5. Click en **"Install"**
