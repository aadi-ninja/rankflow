FROM node:20-alpine

# Install Python, pip, and ffmpeg (required for yt-dlp)
RUN apk add --no-cache python3 py3-pip py3-setuptools ffmpeg
RUN pip3 install --no-cache-dir yt-dlp --break-system-packages

WORKDIR /app

# Install dependencies
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Copy source and build
COPY web/ .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
