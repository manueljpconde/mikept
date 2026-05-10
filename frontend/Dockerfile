FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ARG NEXT_PUBLIC_API_BASE_URL
ARG SUPABASE_SECRET_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY

RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["npm", "run", "start"]
