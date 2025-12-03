import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import packageJson from '../../../package.json';

interface BackendVersion {
  version: string;
}

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private frontendVersion = packageJson.version;

  constructor(private http: HttpClient) {}

  getFrontendVersion(): string {
    return this.frontendVersion;
  }

  getBackendVersion(): Observable<string> {
    return this.http.get<BackendVersion>('/api/version').pipe(
      map(response => response.version),
      catchError(() => of('Unknown'))
    );
  }

  getVersionInfo(): Observable<{ frontend: string; backend: string }> {
    return this.getBackendVersion().pipe(
      map(backendVersion => ({
        frontend: this.frontendVersion,
        backend: backendVersion
      }))
    );
  }
}
