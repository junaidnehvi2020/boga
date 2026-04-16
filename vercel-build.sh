#!/bin/bash
# Fix for Vercel - temporarily remove type module for build
sed -i 's/"type": "module",//' package.json
npx expo export --platform web
