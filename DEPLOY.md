# Déploiement de `aniv01` sur Vercel

Application : **Joyeux Anniversaire — Partage Photos** (PWA + fonction serverless `api/caption.js`).

Le dépôt git local est déjà prêt (initialisé + premier commit). Il reste 3 étapes, toutes côté toi (elles demandent une authentification).

## 1. Créer le dépôt GitHub et pousser

Sur https://github.com/new : crée un dépôt **vide** (sans README), par ex. `aniv01`. Puis, dans ce dossier :

```bash
git remote add origin https://github.com/<ton-compte>/aniv01.git
git push -u origin main
```

> Astuce : dans cette session Claude Code, tu peux lancer ces commandes en tapant `! git push -u origin main` pour que la sortie revienne ici.

## 2. Importer le projet dans Vercel

1. Va sur https://vercel.com/new
2. **Import** le dépôt `aniv01` que tu viens de pousser.
3. Framework preset : **Other** (site statique + fonctions). Laisse les réglages par défaut — `vercel.json` est déjà configuré (rewrite de `/` vers `index.html`, fonction `api/caption.js` à 30 s).

## 3. Variables d'environnement (IMPORTANT)

Dans Vercel → Project → **Settings → Environment Variables**, ajoute :

| Nom | Valeur | Rôle |
|-----|--------|------|
| `ANTHROPIC_API_KEY` | ta clé API Claude (`sk-ant-…`) | légendes automatiques (`api/caption.js`) |
| `ALLOWED_ORIGIN` | `https://aniversaire.vercel.app` | CORS de la fonction caption |

> Déploiement choisi : le code d'`aniv01` remplace le contenu du projet Vercel existant **« aniversaire »** → l'URL reste `https://aniversaire.vercel.app`. Importe donc ce repo dans **ce** projet (ou relie-le), plutôt que d'en créer un nouveau.

Puis **Deploy** (ou redeploy après avoir ajouté les variables).

Sans `ANTHROPIC_API_KEY`, le site fonctionne mais la génération de légendes échoue.

## Notes
- Pas besoin de Node en local : Vercel installe et exécute la fonction.
- Vérifie aussi la config **Supabase** dans `index.html` si l'app pointe vers un projet de base de données précis.
