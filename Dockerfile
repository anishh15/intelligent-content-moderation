# Use Node.js 20 Alpine for ARM64 compatibility
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application code
COPY config ./config
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes
COPY app.js ./

# Create temp directory for image processing
RUN mkdir -p temp

# Expose application port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "app.js"]
