# Prototype · contrôle d'identité numérique à l'accueil

Prototype cliquable (Theodo / France Identité). Il fonctionne dans Edge ou Chrome sur ordinateur, en HTTPS ou sur `localhost`.

## Mettre en ligne (2 minutes)
1. Créer un dépôt GitHub et y déposer **le contenu** de ce dossier (pas le zip).
2. Settings → Pages → Branch `main` / dossier racine → Save.
3. Ouvrir l'URL `https://<compte>.github.io/<dépôt>/`.

N'importe quel hébergeur de fichiers statiques en HTTPS convient aussi (Netlify, Cloudflare Pages…).

## Utiliser sans internet
Ouvrir l'URL **une fois en ligne** : l'application se met en cache. Ensuite, elle se rouvre sans réseau (Edge : même URL).
Si le cache du navigateur est vidé à la fermeture, il faut un premier chargement en ligne à chaque fois.

## Parcours de test
Début de service → Commencer → choisir « Caméra du poste » (ou « Douchette ») → afficher le QR code dans l'app France Identité → scanner → associer le téléphone → accepter et déverrouiller → résultat → décision → Registre du jour → Terminer le service → exporter (anonymisé ou non) → Supprimer.

Les boutons noirs en bas de page (« Prototype · simuler ») ouvrent les écrans de résultat sans téléphone, pour la démonstration.

## Ce qui est réel / simulé
Réel : lecture du QR code, appairage Bluetooth, demande et réception des données (nom, prénom, photo), vérification de la signature, de l'intégrité et de la chaîne de certificats (IACA intégrés), registre local, export CSV, suppression.
Simulé : mise à jour de la liste de confiance (la liste intégrée est conservée, seule la date change), pré-annonce (aucune source : l'agent compare à vue), nom d'usage (voir hypothèse).

## Hypothèses
- « Nom d'usage » : affiché si `family_name` diffère de `family_name_birth`, sinon « Aucun ». À confirmer avec le contenu réel du titre.
- Le registre conserve noms et prénoms dans le navigateur ; l'export les retire quand l'anonymisation est activée (par défaut).
- Un même titre contrôlé plusieurs fois : rien de spécial pour l'instant.
- Le QR code est lu en caméra ou en « douchette » (saisie clavier terminée par Entrée, QR commençant par `mdoc:`).

## Licence
Le moteur de lecture mdoc (dossier `js/`) vient de [mdoc-web-verifier](https://github.com/stelauconseil/mdoc-web-verifier) de Stelau, sous licence Apache 2.0 (voir `LICENSE-STELAU-Apache-2.0` et `NOTICE-STELAU`).
Modification : `js/request-builder.js` (ajout des demandes `pid_visitor` et `mdl_visitor`).
