# 🛍️ Boutique néon — Mini-app Telegram + commandes WhatsApp

Mini-application Telegram (Web App) au design futuriste : accueil avec recherche et catégories, panier, avis clients, réseaux sociaux, panel admin complet et envoi des commandes sur WhatsApp.

**Aucune dépendance à installer** : il suffit de Node.js 18 ou plus récent.

---

## 1. Démarrage rapide (en local)

```bash
cp .env.example .env      # puis renseignez ADMIN_PHONE et ADMIN_PASSWORD
npm start
```

- Boutique : http://localhost:3000
- Panel admin : http://localhost:3000/admin

Au premier lancement, des catégories, produits, avis et réseaux de démonstration sont créés. Vous pouvez tout modifier ou supprimer depuis l'admin.

## 2. Brancher le bot Telegram

1. Sur Telegram, ouvrez **@BotFather** → `/newbot` → copiez le **token** dans `BOT_TOKEN`.
2. Telegram exige une **URL publique en HTTPS**. Mettez-la dans `WEBAPP_URL` :
   - **Pour tester** depuis votre ordinateur : `npx cloudflared tunnel --url http://localhost:3000` (ou `ngrok http 3000`) et copiez l'URL `https://…` obtenue.
   - **En production** : un VPS, Railway, Render, Fly.io… (voir §6).
3. Redémarrez le serveur (`npm start`). Le bot :
   - répond à `/start` avec un bouton **🛍️ Ouvrir la boutique** ;
   - ajoute un bouton **Boutique** permanent à côté du champ de message ;
   - répond à `/id` avec votre chat ID.
4. *(Optionnel)* Dans @BotFather → `/newapp`, vous pouvez aussi créer un lien direct `t.me/votrebot/boutique` vers la même URL.

## 3. Recevoir les commandes sur WhatsApp

Renseignez votre numéro dans **Admin → Général** (format international sans `+` : `33612345678`), puis choisissez le mode dans `.env` :

| `WHATSAPP_PROVIDER` | Fonctionnement | Configuration |
|---|---|---|
| `link` *(par défaut)* | Après validation, WhatsApp s'ouvre chez le client avec le récapitulatif pré-rempli, envoyé à votre numéro en un clic. | Aucune |
| `callmebot` | **Envoi 100 % automatique** du récapitulatif sur *votre* WhatsApp, dès la validation. Gratuit. | Suivez les instructions sur callmebot.com (rubrique WhatsApp) pour obtenir votre clé API, puis `CALLMEBOT_APIKEY=…` |
| `cloud` | Envoi automatique via l'API officielle WhatsApp Cloud de Meta. | `WHATSAPP_CLOUD_TOKEN` et `WHATSAPP_CLOUD_PHONE_ID` (Meta for Developers). ⚠️ Meta n'autorise un message libre que si vous avez écrit au numéro émetteur dans les dernières 24 h ; sinon il faut un modèle approuvé. |

En mode automatique, le client voit aussi un bouton pour vous écrire sur WhatsApp.
Si l'envoi automatique échoue, la commande reste enregistrée dans l'admin et le client peut toujours l'envoyer par le lien.

**Copie sur Telegram (conseillé)** : envoyez `/id` à votre bot et mettez la valeur dans `TELEGRAM_ADMIN_CHAT_ID`. Chaque commande vous arrive aussi sur Telegram.

Le client reçoit en plus une confirmation dans le bot quand il commande depuis Telegram.

Test : **Admin → Intégrations → Envoyer un message de test**.

### Exemple de message reçu

```
🛒 NOUVELLE COMMANDE #A1B2C3
🏪 NEON LEAF — 22/09/2026 18:33:12

👤 Client
Nom : Hajar
Téléphone : +33 6 11 22 33 44
Adresse : 10 rue de Paris, 75001 Paris
Telegram : @pseudo (ID 123456)

📦 Articles
• Matcha Cérémonial — 100 g × 1 = 49,00 €
• Sencha Premium — 250 g × 1 = 39,00 €

Sous-total : 88,00 €
Livraison : offerte
⚖️ Poids total : 350 g
💶 TOTAL : 88,00 €
```

## 4. Accès admin spécial

Trois façons d'entrer dans le panel :

1. **Depuis Telegram, sans mot de passe** : envoyez `/id` à votre bot, puis collez votre ID dans **Admin → Général → Accès admin spécial** (ou dans `ADMIN_TELEGRAM_IDS` du `.env`). Ensuite :
   - un bouton **⚙️ Admin** apparaît en haut de la boutique, visible uniquement par vous ;
   - la commande `/admin` du bot ouvre directement le panel ;
   - `/start` affiche aussi un bouton **⚙️ Panel admin**.
   Votre identité est vérifiée grâce à la signature Telegram : personne d'autre ne peut se faire passer pour vous.
2. **Accès discret** : appuyez 5 fois rapidement sur le logo de la boutique. Une page « Accès admin » s'ouvre et demande le **numéro de téléphone** (`ADMIN_PHONE`) et le **mot de passe** (`ADMIN_PASSWORD`). Le numéro est accepté avec ou sans indicatif (+212…, 00212… ou 0…).
3. **Depuis un navigateur** : `https://votre-url/admin`, avec les mêmes identifiants.

## 5. Le panel admin (`/admin`)

| Onglet | Ce que vous pouvez faire |
|---|---|
| **Général** | Nom, slogan, logo, numéro WhatsApp, IDs Telegram des admins, frais de livraison, livraison offerte dès X €, minimum de commande, message du panier, activer ou non les avis clients |
| **Thème** | 6 palettes néon prêtes à l'emploi, couleurs personnalisées (dont la couleur des grammes et des prix), intensité du néon, **image de fond perso**, voile sombre, **flou derrière les textes**, opacité des panneaux, fond animé. **Aperçu en direct** dans un téléphone simulé. |
| **Catégories** | Ajouter, renommer, réordonner, supprimer, changer l'image |
| **Produits** | Nom, catégorie, description, image, badge (NOUVEAU, PROMO…), visible ou masqué, **plusieurs formats en grammes avec un prix en € chacun**, dupliquer |
| **Avis** | Valider les avis envoyés par les clients, en ajouter ou en modifier |
| **Réseaux** | Instagram, TikTok, Telegram, Snapchat, WhatsApp, Facebook, X, YouTube, Signal, site web |
| **Commandes** | Liste complète, statut (nouvelle → confirmée → expédiée → livrée / annulée), chiffre d'affaires, bouton pour contacter le client |
| **Intégrations** | État du bot, de WhatsApp et de l'URL, et bouton de test |

Les images importées sont redimensionnées automatiquement puis stockées dans `public/uploads/`.

## 6. Mise en production

Toutes les données sont dans **`data/db.json`** et les images dans **`public/uploads/`** : ces deux dossiers doivent être **persistants** (disque persistant sur Render ou Railway, ou simplement un VPS). Sauvegardez-les régulièrement.

Exemple sur un VPS (Ubuntu) :

```bash
git clone <votre-repo> boutique && cd boutique
cp .env.example .env && nano .env
npx pm2 start server.js --name boutique && npx pm2 save
# Reverse-proxy HTTPS avec Caddy :  maboutique.fr { reverse_proxy localhost:3000 }
```

## 7. Sécurité

- Changez **`ADMIN_PASSWORD`** (le panel affiche une alerte tant que le mot de passe par défaut est utilisé).
- Les prix sont **toujours recalculés côté serveur** : un client ne peut pas modifier le montant.
- `REQUIRE_TELEGRAM=true` : les commandes ne sont acceptées que depuis Telegram, et la signature `initData` est vérifiée avec votre token de bot.
- Les commandes, les avis et les connexions à l'admin sont limités en fréquence.

## Structure

```
server.js            Serveur HTTP, API, bot Telegram, envoi WhatsApp
public/index.html    Mini-app (accueil, panier, avis, réseaux)
public/app.css/js    Design néon + logique client
public/admin.*       Panel administrateur
data/db.json         Base de données (créée au 1er lancement)
public/uploads/      Images importées
```
