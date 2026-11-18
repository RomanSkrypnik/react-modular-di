import { Module, injectable, type DependencyModule } from "react-modular-di";

@injectable()
class Configuration {
  readonly message = "next-production:configured";
}

@injectable()
class ApiClient {
  constructor(readonly configuration: Configuration) {}
}

@Module({ providers: [Configuration, ApiClient] })
class HttpModule {
  declare static register: DependencyModule["register"];
}

@injectable()
export class GreetingService {
  constructor(private readonly api: ApiClient) {}

  getMessage() {
    return this.api.configuration.message;
  }
}

@Module({ imports: [HttpModule], providers: [GreetingService] })
export class AppModule {
  declare static register: DependencyModule["register"];
}
