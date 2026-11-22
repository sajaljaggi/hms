FROM node:20-alpine

WORKDIR /app

# Slot DATE+TIME columns hold IST wall-clock times and are parsed in the process TZ.
# Alpine ships without zoneinfo, so tzdata is needed for TZ to take effect.
RUN apk add --no-cache tzdata
ENV TZ=Asia/Kolkata

# Install dependencies first so this layer is cached unless package.json changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN chmod +x start.sh

EXPOSE 5000

CMD ["./start.sh"]
