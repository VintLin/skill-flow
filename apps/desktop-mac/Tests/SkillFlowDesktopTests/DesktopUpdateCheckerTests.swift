import Foundation
import XCTest

@testable import SkillFlowDesktop

final class DesktopUpdateCheckerTests: XCTestCase {
    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testFetchLatestReleaseUsesGitHubLatestRedirectURL() async throws {
        let finalURL = URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.3.6")!
        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://github.com/VintLin/skill-flow/releases/latest")
            XCTAssertEqual(request.httpMethod, "HEAD")
            let response = HTTPURLResponse(
                url: finalURL,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Data())
        }

        let checker = DesktopGitHubUpdateChecker(session: Self.mockSession())
        let release = try await checker.fetchLatestRelease()

        XCTAssertEqual(release.version, "1.3.6")
        XCTAssertEqual(release.releaseURL, finalURL)
    }

    func testFetchLatestReleaseRejectsNonReleaseURL() async {
        let finalURL = URL(string: "https://github.com/VintLin/skill-flow/releases")!
        MockURLProtocol.requestHandler = { _ in
            let response = HTTPURLResponse(
                url: finalURL,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Data())
        }

        let checker = DesktopGitHubUpdateChecker(session: Self.mockSession())

        do {
            _ = try await checker.fetchLatestRelease()
            XCTFail("Expected non-tag release URL to fail.")
        } catch let error as DesktopUpdateCheckError {
            XCTAssertEqual(error, .invalidReleaseURL)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    private static func mockSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private final class MockURLProtocol: URLProtocol {
    nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let requestHandler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: DesktopUpdateCheckError.invalidResponse)
            return
        }

        do {
            let (response, data) = try requestHandler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
