FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer is cached unless package.json changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Prescription/profile-image uploads are written here at runtime — mount a
# volume over this in docker-compose.yml so they survive container restarts.
RUN mkdir -p uploads/doctors

RUN chmod +x start.sh

EXPOSE 5000

CMD ["./start.sh"]
