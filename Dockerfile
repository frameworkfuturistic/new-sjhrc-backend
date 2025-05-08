# Use an official Node.js runtime as a base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install -g npm@11.3.0

RUN npm cache clean --force
RUN npm install --production --legacy-peer-deps || cat /root/.npm/_logs/*.log
# Copy the rest of the application code to the working directory
COPY . .

# Expose the port your app runs on
EXPOSE 5656

# Start the Next.js application
CMD ["npm", "run", "start"]

