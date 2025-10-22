# AI Code Review Backend

An intelligent and automated code review platform that provides real-time code analysis and feedback on GitHub pull requests.

## Architecture

The system consists of several key components:

### Core Services

- **GitHub Integration**: Handles webhooks and API interactions for PR events
- **AI Review Service**: Generates intelligent code reviews using Gemini AI
- **RAG (Retrieval Augmented Generation)**: Provides repository context for more accurate reviews
- **Real-time Updates**: WebSocket integration for live feedback

### Data Storage

- **PostgreSQL**: Stores review history, commit data, and application logs
- **Pinecone**: Vector database for storing and retrieving code context

### Key Features

- Real-time PR monitoring and review generation
- Context-aware code analysis
- Automated comment management
- Review history tracking
- Repository indexing for context
- Real-time logging and monitoring

## Technology Stack

- **Backend Framework**: Node.js with Express
- **Database**: PostgreSQL for structured data
- **Vector Database**: Pinecone for code embeddings
- **AI Model**: Gemini AI for code analysis
- **Real-Time Logs**: Socket.IO
- **Container**: Docker and Docker Compose
- **API Client**: Octokit for GitHub integration
- **Authentication**: GitHub OAuth

## Setup and Installation

### Prerequisites

- Node.js (v20 or later)
- PostgreSQL
- Docker and Docker Compose (optional)
- GitHub Account and Personal Access Token
- Gemini AI API Key
- Pinecone API Key

### Environment Variables

Create a `.env` file with:

```env
GITHUB_TOKEN=your_github_token

GEMINI_API_KEY=your_gemini_api_key
PINECONE_API_KEY=your_pinecone_api_key

PG_HOST=localhost
PG_PORT=5432
PG_USER=your_username
PG_PASSWORD=your_password
PG_DATABASE=code_review

```

You can generate the github token for a particular repo or a general token for all repositories, make sure to give the right permission to the token which include **Pull Request (Read & Write)**, **Metadata (Read only)**, **Contents (Read only)** & **Issues (Read & Write)**.

# Application Settings

```
PORT=8080
```

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Barnamoyy/ai-code-review-backend.git
   cd ai-code-review-backend
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Start the application:**

   Using Node.js directly:

   ```bash
   npm run dev
   ```

   Using Docker:

   ```bash
   docker-compose up --build
   ```

## Usage

### Repository Indexing

Before using the review system, index your repository:

```bash
npm run index-repo owner/repository
```

### Setting up GitHub Webhook

1. Go to your repository settings
2. Add a webhook with URL: `http://your-domain/webhook/github`
3. Select events:
   - Pull requests
   - Pull request reviews
   - Pull request review comments

For development purposes you can use ngrok url get your webhook url by running command and following the above steps.

```
ngrok http 8080 || YOUR_PORT
```

### Frontend Dashboard 

Once the server is up an running on port 8080 or any other port you can track see the logs, review histroy, commit history and general analytics by cloning this repo 

```https://github.com/Barnamoyy/ai-code-review-frontend```

### API Endpoints

#### Webhooks

- `POST /webhook/github`: GitHub webhook endpoint

#### Review Management

- `GET /api/getreviews`: Get reviews for a repository
- `GET /api/getreview`: Get specific review details
- `POST /api/addreview`: Add a new review
- `POST /api/deletereview`: Delete a review

#### Commit Tracking

- `GET /api/getcommits`: Get commits for a repository
- `POST /api/addcommit`: Add a new commit
- `GET /api/getcommit`: Get specific commit details

#### User Management

- `POST /api/users`: Add a new user
- `GET /api/getuser`: Get user details
- `POST /api/repositories`: Add repository to user

## Design Decisions

### Why Node.js?

- Excellent async I/O handling for webhook processing
- Easy to implement with less boilerplate
- Strong WebSocket support for real-time updates

### Why PostgreSQL?

- ACID compliance for reliable data storage
- low latency query capabilities for running analytics
- Excellent support for JSON data types

### Why Pinecone?

- Optimized for vector similarity search
- Scales well for large codebases
- Supports metadata filtering

### Why Gemini AI?

- Although any AI model can be used here *We prefer you go with Claude Code* we have used gemeni here, accordingly the API call in ```aiReviewService.js``` & the key ```.env``` needs to be changed.

## Performance Considerations

- Batch processing for comment creation
- Concurrent file processing during indexing
- Connection pooling for database operations
- Caching for frequently accessed data
- Rate limiting for external API calls

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Authors

- Barnamoy Roy

## Acknowledgments

- GitHub API Documentation
- Gemini AI Team
- Pinecone Documentation
- Node.js Community
