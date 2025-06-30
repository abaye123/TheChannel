#!/bin/bash

cat <<EOF > src/environments/environment.prod.ts
export const environment = {
    production: true,
    googleOauthUrl: ${GOOGLE_OAUTH_URL},
    googleOauthScope: ${GOOGLE_OAUTH_SCOPE},
    googleClientId: ${GOOGLE_CLIENT_ID},
    googleRedirectUri: ${GOOGLE_REDIRECT_URI},
};
EOF