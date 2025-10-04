FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application
COPY . .

# Expose Expo web port
EXPOSE 19006

# Set environment to skip device selection prompts
ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
ENV CI=1
ENV EXPO_OFFLINE=1

# Start Expo web directly (skips platform selection, offline mode)
CMD ["npx", "expo", "start", "--web", "--port", "19006", "--offline"]
