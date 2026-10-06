#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <ImageIO/ImageIO.h>

static void emit(id value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    [[NSFileHandle fileHandleWithStandardOutput] writeData:data];
}
static int fail(NSString *code) {emit(@{@"error":code}); return 1;}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) return fail(@"ocr_invalid_image");
        if (@available(macOS 10.15, *)) {
            NSURL *url = [NSURL fileURLWithPath:@(argv[1])];
            CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
            if (!source) return fail(@"ocr_invalid_image");
            NSDictionary *properties = (__bridge_transfer NSDictionary *)CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
            CFRelease(source);
            if (!properties) return fail(@"ocr_invalid_image");
            VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
            request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
            request.recognitionLanguages = @[@"zh-Hans", @"en-US"];
            request.usesLanguageCorrection = YES;
            CGImagePropertyOrientation orientation = (CGImagePropertyOrientation)([properties[(__bridge NSString *)kCGImagePropertyOrientation] unsignedIntValue] ?: 1);
            VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithURL:url orientation:orientation options:@{}];
            NSError *error = nil;
            if (![handler performRequests:@[request] error:&error]) return fail(@"ocr_recognition_failed");
            NSMutableArray *lines = [NSMutableArray array];
            for (VNRecognizedTextObservation *observation in request.results) {
                VNRecognizedText *candidate = [observation topCandidates:1].firstObject;
                if (!candidate.string.length) continue;
                CGRect box = observation.boundingBox;
                [lines addObject:@{@"text":candidate.string, @"x":@(box.origin.x),
                    @"y":@(1.0 - box.origin.y - box.size.height), @"w":@(box.size.width),
                    @"h":@(box.size.height), @"confidence":@(candidate.confidence)}];
            }
            [lines sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
                NSComparisonResult byY = [a[@"y"] compare:b[@"y"]];
                return byY == NSOrderedSame ? [a[@"x"] compare:b[@"x"]] : byY;
            }];
            emit(lines);
            return 0;
        }
        return fail(@"ocr_unsupported_platform");
    }
}
