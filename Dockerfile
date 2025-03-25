FROM node:20-bullseye

# Install dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy the rest of the application
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose necessary ports (if applicable)
EXPOSE 3000

# Command to run the bot
CMD ["npm", "start"]
