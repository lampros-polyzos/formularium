# The backend as a container image: how Render (or any container host) runs it.
#   docker build -t formularium-api backend
#   docker run --rm -p 8080:8080 --env-file backend/.env formularium-api

# ---- build: compile the application into one jar (the tests run in CI, not here)
FROM eclipse-temurin:27-jdk AS build
WORKDIR /build
COPY .mvn .mvn
COPY mvnw pom.xml ./
# A Windows checkout can give the wrapper CRLF line endings, which Linux cannot run
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw
# Dependencies first, so this layer is reused until pom.xml changes
RUN ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q package -DskipTests

# ---- run: a JRE, an unprivileged user and the jar, nothing else
FROM eclipse-temurin:27-jre
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
USER app
EXPOSE 8080
# Stay inside a small container's memory (a free plan has about 512 MB), and let the platform restart the app if it ever runs out
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError"
# The settings (database, secrets...) come from environment variables: see .env.example
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
